import { SettingsService } from '../settings/settings.service.js';
import { auditActor } from '../audit/actor.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../auth/auth.types.js';
import {
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  sniffImageType,
  type ImageType,
} from '../campaigns/image-type.js';
import { randomToken } from '../common/tokens.js';
import type { Env } from '../config/env.js';
import type {
  IdentityVerification,
  Prisma,
} from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { identityDecisionEmail } from '../mail/templates.js';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { namesMatch } from '../bank-accounts/name-match.js';
import { documentCipher, type DocumentCipher } from './document-cipher.js';
import {
  KYC_PROVIDER,
  KycProviderError,
  type IdentityResultEvent,
  type KycProvider,
} from './kyc-provider.js';
import type {
  DecisionInput,
  QueueQuery,
  SubmissionInput,
} from './kyc.schemas.js';

const PAGE_SIZE = 20;
const MIN_AGE = 18;
const EXTENSION_TYPES: Record<string, ImageType> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export type IdentityStatus = 'NONE' | 'PENDING' | 'VERIFIED' | 'REJECTED';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole years between a YYYY-MM-DD birth date and `now`, in UTC. */
export function ageOn(dateOfBirth: string, now: Date): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  let age = now.getUTCFullYear() - y;
  const month = now.getUTCMonth() + 1;
  if (month < m || (month === m && now.getUTCDate() < d)) age--;
  return age;
}

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private readonly cipher: DocumentCipher;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
    @Inject(KYC_PROVIDER) private readonly provider: KycProvider,
    private readonly settings: SettingsService,
  ) {
    this.cipher = documentCipher(config);
  }

  /** The confirmed legal name, or null when the person isn't verified. */
  async verifiedName(
    userId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<string | null> {
    const row = await tx.identityVerification.findFirst({
      where: { userId, status: 'VERIFIED' },
      orderBy: { decidedAt: 'desc' },
      select: { verifiedName: true },
    });
    return row?.verifiedName ?? null;
  }

  /** Throws 403 with code IDENTITY_UNVERIFIED unless the person is verified. */
  async requireVerified(
    userId: string,
    message: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const name = await this.verifiedName(userId, tx);
    if (!name)
      throw new ForbiddenException({ message, code: 'IDENTITY_UNVERIFIED' });
    return name;
  }

  async status(user: AuthUser) {
    const verified = await this.prisma.identityVerification.findFirst({
      where: { userId: user.id, status: 'VERIFIED' },
      orderBy: { decidedAt: 'desc' },
    });
    const current =
      verified ??
      (await this.prisma.identityVerification.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      }));
    return {
      status: (current?.status ?? 'NONE') as IdentityStatus,
      provider: this.provider.name,
      documentRequired: this.provider.needsDocument,
      selfieRequired: this.provider.needsSelfie,
      privacyPolicyUrl: this.provider.privacyPolicyUrl ?? null,
      verification: current ? this.presentOwn(current) : null,
    };
  }

  /**
   * Step 1 (when the provider needs a document): store the ID photo,
   * encrypted, and return a key to submit with the details.
   */
  async uploadDocument(user: AuthUser, body: Buffer) {
    await this.assertCanSubmit(user);
    if (body.length === 0)
      throw new BadRequestException('Attach a photo of your ID');
    if (body.length > MAX_IMAGE_BYTES)
      throw new PayloadTooLargeException('ID photos must be 5 MB or smaller');
    const type = sniffImageType(body);
    if (!type)
      throw new BadRequestException(
        'Upload a JPEG, PNG or WebP photo of your ID',
      );
    const key = `kyc/${user.id}/${randomToken(16)}.${IMAGE_EXTENSIONS[type]}.enc`;
    // Tracked before the write, so the retention sweep can delete it if it's
    // never submitted (a failed write leaves a row for a missing file: harmless).
    await this.prisma.identityDocumentUpload.create({
      data: { key, userId: user.id },
    });
    await this.storage.put(
      key,
      this.cipher.encrypt(body, key),
      'application/octet-stream',
    );
    return { documentKey: key, contentType: type, size: body.length };
  }

  /** Step 2: the details. The full ID number goes to the provider only. */
  async submit(user: AuthUser, input: SubmissionInput) {
    await this.assertCanSubmit(user);
    if (this.provider.name !== 'manual' && !input.consent)
      throw new BadRequestException({
        message: 'Check your details',
        errors: [
          {
            path: 'consent',
            message: 'Allow us to send your details to our identity provider.',
          },
        ],
      });
    const age = ageOn(input.dateOfBirth, new Date());
    if (age < MIN_AGE || age > 120)
      throw new BadRequestException({
        message: 'Check your details',
        errors: [
          {
            path: 'dateOfBirth',
            message:
              age < MIN_AGE
                ? `You must be ${MIN_AGE} or older to raise money`
                : 'Check your date of birth',
          },
        ],
      });

    // The stored photo this submission relies on: the ID photo for the
    // manual provider, the selfie for vendor face match. Either way it is
    // kept encrypted as the row's document for evidence and retention.
    const keyPath = this.provider.needsDocument
      ? 'documentKey'
      : this.provider.needsSelfie
        ? 'selfieKey'
        : null;
    const storedKey = this.provider.needsDocument
      ? input.documentKey
      : this.provider.needsSelfie
        ? input.selfieKey
        : undefined;
    let documentContentType: ImageType | null = null;
    let selfie: { bytes: Uint8Array; contentType: string } | undefined;
    if (keyPath) {
      const ext = storedKey?.match(
        /^kyc\/[^/]+\/[A-Za-z0-9_-]+\.(jpg|png|webp)\.enc$/,
      )?.[1];
      if (!storedKey || !ext || !storedKey.startsWith(`kyc/${user.id}/`))
        throw new BadRequestException({
          message: 'Check your details',
          errors: [
            {
              path: keyPath,
              message: this.provider.needsDocument
                ? 'Attach a photo of your ID'
                : 'Take a selfie',
            },
          ],
        });
      const sealed = await this.storage.read(storedKey);
      if (!sealed)
        throw new BadRequestException({
          message: 'Check your details',
          errors: [
            {
              path: keyPath,
              message: this.provider.needsDocument
                ? 'Upload the photo of your ID again'
                : 'Take the selfie again',
            },
          ],
        });
      documentContentType = EXTENSION_TYPES[ext]!;
      if (this.provider.needsSelfie)
        selfie = {
          bytes: this.cipher.decrypt(sealed, storedKey),
          contentType: documentContentType,
        };
    }

    if (
      this.provider.name !== 'manual' &&
      !['NIN_SLIP', 'BVN'].includes(input.documentType)
    )
      throw new BadRequestException({
        message: 'Check your details',
        errors: [{ path: 'documentType', message: 'Choose a NIN or a BVN.' }],
      });

    // Reserve the open check and claim its upload before calling a paid vendor.
    // The unique pending-user index serializes concurrent submissions, and a
    // fast callback can already find its correlation reference.
    const reference =
      this.provider.name === 'manual' ? null : `or-${randomToken(24)}`;
    let row: IdentityVerification;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
        const existing = await tx.identityVerification.findFirst({
          where: { userId: user.id, status: { in: ['PENDING', 'VERIFIED'] } },
        });
        if (existing)
          throw new ConflictException(
            existing.status === 'VERIFIED'
              ? 'Your identity is already verified'
              : 'Your identity check is already being reviewed',
          );
        if (storedKey) {
          const claimed = await tx.identityDocumentUpload.deleteMany({
            where: { key: storedKey, userId: user.id },
          });
          if (claimed.count === 0)
            throw new BadRequestException({
              message: 'Check your details',
              errors: [
                {
                  path: keyPath!,
                  message: this.provider.needsSelfie
                    ? 'Take the selfie again'
                    : 'Upload the photo of your ID again',
                },
              ],
            });
        }
        return tx.identityVerification.create({
          data: {
            userId: user.id,
            provider: this.provider.name,
            providerReference: reference,
            status: 'PENDING',
            documentType: input.documentType,
            idNumberLast4: input.idNumber.slice(-4),
            legalName: input.legalName,
            dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00Z`),
            documentKey: storedKey ?? null,
            documentContentType,
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException(
          'Your identity check is already being reviewed',
        );
      throw error;
    }

    let check;
    try {
      check = await this.provider.check({
        userId: user.id,
        ...(reference ? { reference } : {}),
        documentType: input.documentType,
        idNumber: input.idNumber,
        legalName: input.legalName,
        dateOfBirth: input.dateOfBirth,
        email: user.email,
        consent: input.consent,
        ...(selfie ? { selfie } : {}),
      });
    } catch (error) {
      // A timeout or malformed acknowledgement can follow a successful paid
      // submission. Keep the reservation for callback/admin reconciliation;
      // allowing another submission here could create duplicate vendor jobs.
      if (error instanceof KycProviderError)
        throw new ServiceUnavailableException({
          message:
            'We could not confirm the result yet. Reload to check your verification status before trying again.',
          code: 'IDENTITY_CHECK_UNAVAILABLE',
        });
      throw error;
    }

    const completed = await this.prisma.identityVerification.updateMany({
      where: { id: row.id, status: 'PENDING' },
      data: {
        providerReference: check.reference,
        status: check.status,
        verifiedName: check.status === 'VERIFIED' ? check.verifiedName : null,
        reason: check.status === 'REJECTED' ? check.reason : null,
        decidedAt: check.status === 'PENDING' ? null : new Date(),
        ...(check.status === 'REJECTED'
          ? { documentKey: null, documentContentType: null }
          : {}),
      },
    });
    if (completed.count > 0 && check.status === 'REJECTED' && storedKey)
      await this.storage.deleteQuietly(storedKey);
    // A callback or administrator may have decided it while the request ran.
    return this.presentOwn(
      await this.prisma.identityVerification.findUniqueOrThrow({
        where: { id: row.id },
      }),
    );
  }

  /**
   * A vendor result delivered later (Smile's webhook). The signature has
   * already been verified by the controller. `attention`/`error` outcomes
   * arrive as PENDING and change nothing: an administrator decides those
   * from the queue. A VERIFIED result is still cross-checked against the
   * submitted name and date of birth before it verifies anyone.
   */
  async applyResult(event: IdentityResultEvent) {
    const row = await this.prisma.identityVerification.findFirst({
      where: {
        provider: this.provider.name,
        providerReference: event.reference,
      },
      include: { user: { select: { name: true, email: true } } },
    });
    // A fast callback can beat the submission transaction. Ask the vendor to retry.
    if (!row)
      throw new ServiceUnavailableException('Identity submission is not ready');
    if (row.status !== 'PENDING' || event.check.status === 'PENDING')
      return { applied: false };

    let check = event.check;
    if (
      check.status === 'VERIFIED' &&
      (!namesMatch(row.legalName, check.verifiedName) ||
        !check.verifiedDateOfBirth ||
        check.verifiedDateOfBirth !== isoDate(row.dateOfBirth))
    )
      check = {
        status: 'REJECTED',
        reference: event.reference,
        reason:
          'The details on that ID do not match the details you entered. Check them and try again.',
      };
    const approve = check.status === 'VERIFIED';
    const verifiedName =
      check.status === 'VERIFIED' ? check.verifiedName : null;
    const reason = check.status === 'REJECTED' ? check.reason : null;
    const claimed = await this.prisma.identityVerification.updateMany({
      where: { id: row.id, status: 'PENDING' },
      data: {
        status: approve ? 'VERIFIED' : 'REJECTED',
        verifiedName,
        reason,
        decidedAt: new Date(),
        ...(approve ? {} : { documentKey: null, documentContentType: null }),
      },
    });
    if (claimed.count === 0) return { applied: false };
    if (!approve && row.documentKey)
      await this.storage.deleteQuietly(row.documentKey);
    try {
      await this.mail.send(
        identityDecisionEmail(
          row.user.name,
          row.user.email,
          reason,
          new URL(
            '/dashboard/verification',
            this.config.get('WEB_URL', { infer: true }),
          ).toString(),
          (await this.settings.get()).values.name,
        ),
      );
    } catch (error) {
      this.logger.warn(`Identity decision email not sent: ${String(error)}`);
    }
    return { applied: true };
  }

  async queue(query: QueueQuery) {
    const where: Prisma.IdentityVerificationWhereInput = {
      status: query.status,
      ...(query.q
        ? {
            OR: [
              { legalName: { contains: query.q, mode: 'insensitive' } },
              { user: { name: { contains: query.q, mode: 'insensitive' } } },
              { user: { email: { contains: query.q.toLowerCase() } } },
            ],
          }
        : {}),
    };
    const [items, total, pending] = await Promise.all([
      this.prisma.identityVerification.findMany({
        where,
        // Oldest waiting first; most recent decisions first.
        orderBy:
          query.status === 'PENDING'
            ? [{ createdAt: 'asc' }, { id: 'asc' }]
            : [{ decidedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { user: { select: { name: true, email: true } } },
      }),
      this.prisma.identityVerification.count({ where }),
      this.prisma.identityVerification.count({
        where: { status: 'PENDING' },
      }),
    ]);
    return {
      items: items.map((r) => ({ ...this.presentAdmin(r), user: r.user })),
      total,
      pending,
      page: query.page,
      limit: PAGE_SIZE,
    };
  }

  async detail(id: string) {
    const row = await this.prisma.identityVerification.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            emailVerifiedAt: true,
            createdAt: true,
          },
        },
        reviewer: { select: { name: true } },
      },
    });
    if (!row) throw new NotFoundException('Verification not found');
    const history = await this.prisma.identityVerification.findMany({
      where: { userId: row.userId, id: { not: row.id } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { reviewer: { select: { name: true } } },
    });
    return {
      verification: {
        ...this.presentAdmin(row),
        reviewer: row.reviewer,
        hasDocument: !!row.documentKey,
        documentDeletedAt: row.documentDeletedAt,
      },
      user: {
        id: row.user.id,
        name: row.user.name,
        email: row.user.email,
        emailVerified: !!row.user.emailVerifiedAt,
        createdAt: row.user.createdAt,
      },
      history: history.map((h) => ({
        ...this.presentAdmin(h),
        reviewer: h.reviewer,
      })),
    };
  }

  /** The decrypted ID photo, for administrators only. */
  async document(id: string) {
    const row = await this.prisma.identityVerification.findUnique({
      where: { id },
      select: { documentKey: true, documentContentType: true },
    });
    if (!row?.documentKey || !row.documentContentType)
      throw new NotFoundException('No document for this verification');
    const sealed = await this.storage.read(row.documentKey);
    if (!sealed)
      throw new NotFoundException('No document for this verification');
    return {
      bytes: this.cipher.decrypt(sealed, row.documentKey),
      contentType: row.documentContentType,
    };
  }

  async decide(admin: AuthUser, id: string, input: DecisionInput) {
    const row = await this.prisma.identityVerification.findUnique({
      where: { id },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!row) throw new NotFoundException('Verification not found');
    if (row.userId === admin.id)
      throw new ForbiddenException(
        'Another administrator must review your own identity',
      );
    if (row.status !== 'PENDING')
      throw new ConflictException('This verification has already been decided');

    const approve = input.decision === 'APPROVE';
    // Conditional on the version the reviewer saw, so two reviewers can't
    // both decide and nobody decides on details that changed underneath them.
    const claimed = await this.prisma.$transaction(async (tx) => {
      await auditActor(tx, admin.id);
      return tx.identityVerification.updateMany({
        where: {
          id,
          status: 'PENDING',
          updatedAt: new Date(input.expectedUpdatedAt),
        },
        data: {
          status: approve ? 'VERIFIED' : 'REJECTED',
          verifiedName: approve ? (input.verifiedName ?? row.legalName) : null,
          reason: approve ? null : input.reason!,
          reviewerId: admin.id,
          decidedAt: new Date(),
          // A rejected document has no further use; the creator uploads anew.
          ...(approve ? {} : { documentKey: null, documentContentType: null }),
        },
      });
    });
    if (claimed.count === 0)
      throw new ConflictException(
        'This verification changed while you were reviewing it. Reload and check again.',
      );
    if (!approve && row.documentKey)
      await this.storage.deleteQuietly(row.documentKey);

    try {
      await this.mail.send(
        identityDecisionEmail(
          row.user.name,
          row.user.email,
          approve ? null : input.reason!,
          new URL(
            '/dashboard/verification',
            this.config.get('WEB_URL', { infer: true }),
          ).toString(),
          (await this.settings.get()).values.name,
        ),
      );
    } catch (error) {
      // The decision stands; the dashboard shows it either way.
      this.logger.warn(`Identity decision email not sent: ${String(error)}`);
    }
    return this.detail(id);
  }

  private async assertCanSubmit(user: AuthUser) {
    if (!user.emailVerified)
      throw new ForbiddenException(
        'Verify your email before verifying your identity',
      );
    const open = await this.prisma.identityVerification.findFirst({
      where: { userId: user.id, status: { in: ['PENDING', 'VERIFIED'] } },
      select: { status: true },
    });
    if (open?.status === 'VERIFIED')
      throw new ConflictException('Your identity is already verified');
    if (open?.status === 'PENDING')
      throw new ConflictException(
        'Your identity check is already being reviewed',
      );
  }

  private presentOwn(r: IdentityVerification) {
    return {
      id: r.id,
      status: r.status,
      documentType: r.documentType,
      idNumberLast4: r.idNumberLast4,
      legalName: r.legalName,
      dateOfBirth: isoDate(r.dateOfBirth),
      verifiedName: r.verifiedName,
      reason: r.reason,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
    };
  }

  private presentAdmin(r: IdentityVerification) {
    return {
      ...this.presentOwn(r),
      provider: r.provider,
      updatedAt: r.updatedAt,
    };
  }
}
