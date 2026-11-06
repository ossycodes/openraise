import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
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
import { DocumentCipher } from './document-cipher.js';
import { KYC_PROVIDER, type KycProvider } from './kyc-provider.js';
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
  ) {
    const own = config.get('KYC_ENCRYPTION_KEY', { infer: true });
    this.cipher = own
      ? new DocumentCipher(own, 'openraise-kyc-document-v1')
      : new DocumentCipher(
          config.get('JWT_SECRET', { infer: true }),
          'openraise-kyc-document-from-jwt-secret-v1',
        );
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

    let documentContentType: ImageType | null = null;
    if (this.provider.needsDocument) {
      const key = input.documentKey;
      const ext = key?.match(
        /^kyc\/[^/]+\/[A-Za-z0-9_-]+\.(jpg|png|webp)\.enc$/,
      )?.[1];
      if (!key || !ext || !key.startsWith(`kyc/${user.id}/`))
        throw new BadRequestException({
          message: 'Check your details',
          errors: [
            { path: 'documentKey', message: 'Attach a photo of your ID' },
          ],
        });
      if (!(await this.storage.head(key)))
        throw new BadRequestException({
          message: 'Check your details',
          errors: [
            {
              path: 'documentKey',
              message: 'Upload the photo of your ID again',
            },
          ],
        });
      documentContentType = EXTENSION_TYPES[ext]!;
    }

    const check = await this.provider.check({
      userId: user.id,
      documentType: input.documentType,
      idNumber: input.idNumber,
      legalName: input.legalName,
      dateOfBirth: input.dateOfBirth,
    });
    try {
      const row = await this.prisma.identityVerification.create({
        data: {
          userId: user.id,
          provider: this.provider.name,
          providerReference: check.reference,
          status: check.status,
          documentType: input.documentType,
          idNumberLast4: input.idNumber.slice(-4),
          legalName: input.legalName,
          dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00Z`),
          verifiedName:
            check.status === 'VERIFIED' ? check.verifiedName : null,
          reason: check.status === 'REJECTED' ? check.reason : null,
          documentKey: this.provider.needsDocument ? input.documentKey! : null,
          documentContentType,
          decidedAt: check.status === 'PENDING' ? null : new Date(),
        },
      });
      return this.presentOwn(row);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException(
          'Your identity check is already being reviewed',
        );
      throw error;
    }
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
      throw new ConflictException(
        'This verification has already been decided',
      );

    const approve = input.decision === 'APPROVE';
    // Conditional on the version the reviewer saw, so two reviewers can't
    // both decide and nobody decides on details that changed underneath them.
    const claimed = await this.prisma.identityVerification.updateMany({
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
