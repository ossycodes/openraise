import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { withAuditActor } from '../audit/actor.js';
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
  OrganisationVerification,
  Prisma,
} from '../generated/prisma/client.js';
import { documentCipher, type DocumentCipher } from '../kyc/document-cipher.js';
import { MailService } from '../mail/mail.service.js';
import { organisationVerificationEmail } from '../mail/templates.js';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';

export const REGISTRATION_TYPES = [
  'BUSINESS_NAME',
  'COMPANY',
  'INCORPORATED_TRUSTEES',
] as const;

const registeredName = z
  .string()
  .trim()
  .min(2)
  .max(150)
  .transform((v) => v.replace(/\s+/g, ' '));

export const orgSubmissionSchema = z
  .object({
    registrationType: z.enum(REGISTRATION_TYPES),
    registrationNumber: z
      .string()
      .transform((v) => v.trim().toUpperCase().replace(/\s+/g, ' '))
      .refine((v) => /^[A-Z0-9 /-]{3,20}$/.test(v), {
        message: 'Enter the number as printed, like RC 1234567',
      }),
    registeredName,
    documentKey: z.string().max(200),
  })
  .strict();
export type OrgSubmission = z.infer<typeof orgSubmissionSchema>;

export const orgQueueSchema = z.object({
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).default('PENDING'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export type OrgQueue = z.infer<typeof orgQueueSchema>;

export const orgDecisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    reason: z.string().trim().min(5).max(500).optional(),
    verifiedName: registeredName.optional(),
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict()
  .refine((v) => v.decision === 'APPROVE' || !!v.reason, {
    path: ['reason'],
    message: 'Tell the organisation what to fix',
  });
export type OrgDecision = z.infer<typeof orgDecisionSchema>;

const PAGE_SIZE = 20;
const EXTENSION_TYPES: Record<string, ImageType> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
type Db = Prisma.TransactionClient;

/**
 * Verifying an organisation from its registration certificate, reviewed by an
 * administrator. Mirrors identity verification: the certificate photo is
 * encrypted before storage, only managers submit, declined photos are deleted.
 */
@Injectable()
export class OrganisationVerificationService {
  private readonly logger = new Logger(OrganisationVerificationService.name);
  private readonly cipher: DocumentCipher;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.cipher = documentCipher(config);
  }

  /** The verified registered name, or null. Used by the profile (and payouts later). */
  async verifiedName(organisationId: string, db: Db = this.prisma) {
    const row = await db.organisationVerification.findFirst({
      where: { organisationId, status: 'VERIFIED' },
      orderBy: { decidedAt: 'desc' },
      select: { verifiedName: true },
    });
    return row?.verifiedName ?? null;
  }

  /** For members: where the organisation stands. */
  async status(user: AuthUser, organisationId: string) {
    await this.member(user.id, organisationId);
    const verified = await this.prisma.organisationVerification.findFirst({
      where: { organisationId, status: 'VERIFIED' },
      orderBy: { decidedAt: 'desc' },
    });
    const current =
      verified ??
      (await this.prisma.organisationVerification.findFirst({
        where: { organisationId },
        orderBy: { createdAt: 'desc' },
      }));
    return {
      status: current?.status ?? 'NONE',
      verification: current ? this.present(current) : null,
    };
  }

  async uploadDocument(user: AuthUser, organisationId: string, body: Buffer) {
    await this.manager(user.id, organisationId);
    await this.assertCanSubmit(organisationId);
    if (body.length === 0)
      throw new BadRequestException('Attach a photo of the certificate');
    if (body.length > MAX_IMAGE_BYTES)
      throw new PayloadTooLargeException('Photos must be 5 MB or smaller');
    const type = sniffImageType(body);
    if (!type)
      throw new BadRequestException(
        'Upload a JPEG, PNG or WebP photo of the certificate',
      );
    const key = `org-docs/${organisationId}/${randomToken(16)}.${IMAGE_EXTENSIONS[type]}.enc`;
    // Tracked first, so the retention sweep removes it if never submitted.
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

  async submit(user: AuthUser, organisationId: string, input: OrgSubmission) {
    await this.manager(user.id, organisationId);
    await this.assertCanSubmit(organisationId);
    const ext = input.documentKey.match(
      new RegExp(
        `^org-docs/${organisationId}/[A-Za-z0-9_-]+\\.(jpg|png|webp)\\.enc$`,
      ),
    )?.[1];
    const fix = (message: string) =>
      new BadRequestException({
        message: 'Check the details',
        errors: [{ path: 'documentKey', message }],
      });
    if (!ext) throw fix('Attach a photo of the certificate');
    if (!(await this.storage.head(input.documentKey)))
      throw fix('Upload the photo of the certificate again');
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.identityDocumentUpload.deleteMany({
          where: { key: input.documentKey, userId: user.id },
        });
        if (claimed.count === 0)
          throw fix('Upload the photo of the certificate again');
        return tx.organisationVerification.create({
          data: {
            organisationId,
            submittedById: user.id,
            registrationType: input.registrationType,
            registrationNumber: input.registrationNumber,
            registeredName: input.registeredName,
            documentKey: input.documentKey,
            documentContentType: EXTENSION_TYPES[ext]!,
          },
        });
      });
      return this.present(row);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('This organisation is already being reviewed');
      throw error;
    }
  }

  async queue(query: OrgQueue) {
    const where = { status: query.status };
    const [items, total, pending] = await Promise.all([
      this.prisma.organisationVerification.findMany({
        where,
        orderBy:
          query.status === 'PENDING'
            ? [{ createdAt: 'asc' }, { id: 'asc' }]
            : [{ decidedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { organisation: { select: { name: true, slug: true } } },
      }),
      this.prisma.organisationVerification.count({ where }),
      this.prisma.organisationVerification.count({ where: { status: 'PENDING' } }),
    ]);
    return {
      items: items.map((r) => ({
        ...this.presentAdmin(r),
        organisation: r.organisation,
      })),
      total,
      pending,
      page: query.page,
      limit: PAGE_SIZE,
    };
  }

  async detail(id: string) {
    const row = await this.prisma.organisationVerification.findUnique({
      where: { id },
      include: {
        organisation: {
          select: {
            id: true,
            name: true,
            slug: true,
            website: true,
            location: true,
            createdAt: true,
            _count: { select: { members: true } },
          },
        },
        submittedBy: { select: { name: true, email: true } },
        reviewer: { select: { name: true } },
      },
    });
    if (!row) throw new NotFoundException('Check not found');
    const history = await this.prisma.organisationVerification.findMany({
      where: { organisationId: row.organisationId, id: { not: row.id } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { reviewer: { select: { name: true } } },
    });
    const { _count, ...organisation } = row.organisation;
    return {
      verification: {
        ...this.presentAdmin(row),
        reviewer: row.reviewer,
        hasDocument: !!row.documentKey,
      },
      organisation: { ...organisation, members: _count.members },
      submittedBy: row.submittedBy,
      history: history.map((h) => ({ ...this.presentAdmin(h), reviewer: h.reviewer })),
    };
  }

  /** The decrypted certificate photo, for administrators only. */
  async document(id: string) {
    const row = await this.prisma.organisationVerification.findUnique({
      where: { id },
      select: { documentKey: true, documentContentType: true },
    });
    if (!row?.documentKey || !row.documentContentType)
      throw new NotFoundException('No document for this check');
    const sealed = await this.storage.read(row.documentKey);
    if (!sealed) throw new NotFoundException('No document for this check');
    return {
      bytes: this.cipher.decrypt(sealed, row.documentKey),
      contentType: row.documentContentType,
    };
  }

  async decide(admin: AuthUser, id: string, input: OrgDecision) {
    const row = await this.prisma.organisationVerification.findUnique({
      where: { id },
      include: { organisation: { select: { name: true } } },
    });
    if (!row) throw new NotFoundException('Check not found');
    const insider = await this.prisma.organisationMember.findUnique({
      where: {
        organisationId_userId: {
          organisationId: row.organisationId,
          userId: admin.id,
        },
      },
    });
    if (insider)
      throw new ForbiddenException(
        'Another administrator must review an organisation you belong to',
      );
    if (row.status !== 'PENDING')
      throw new ConflictException('This check has already been decided');
    const approve = input.decision === 'APPROVE';
    const claimed = await withAuditActor(this.prisma, admin.id, (tx) =>
      tx.organisationVerification.updateMany({
        where: {
          id,
          status: 'PENDING',
          updatedAt: new Date(input.expectedUpdatedAt),
        },
        data: {
          status: approve ? 'VERIFIED' : 'REJECTED',
          verifiedName: approve ? (input.verifiedName ?? row.registeredName) : null,
          reason: approve ? null : input.reason!,
          reviewerId: admin.id,
          decidedAt: new Date(),
          ...(approve ? {} : { documentKey: null, documentContentType: null }),
        },
      }),
    );
    if (claimed.count === 0)
      throw new ConflictException(
        'This check changed while you were reviewing it. Reload and check again.',
      );
    if (!approve && row.documentKey)
      await this.storage.deleteQuietly(row.documentKey);
    await this.notifyManagers(
      row.organisationId,
      row.organisation.name,
      approve ? null : input.reason!,
    );
    return this.detail(id);
  }

  private async notifyManagers(
    organisationId: string,
    name: string,
    reason: string | null,
  ) {
    const managers = await this.prisma.organisationMember.findMany({
      where: { organisationId, role: { in: ['OWNER', 'ADMIN'] } },
      include: { user: { select: { email: true } } },
    });
    const link = new URL(
      `/dashboard/organisations/${organisationId}`,
      this.config.get('WEB_URL', { infer: true }),
    ).toString();
    for (const m of managers) {
      try {
        await this.mail.send(
          organisationVerificationEmail(name, m.user.email, reason, link),
        );
      } catch (error) {
        // The decision stands; the dashboard shows it either way.
        this.logger.warn(`Organisation decision email not sent: ${String(error)}`);
      }
    }
  }

  private async assertCanSubmit(organisationId: string) {
    const open = await this.prisma.organisationVerification.findFirst({
      where: { organisationId, status: { in: ['PENDING', 'VERIFIED'] } },
      select: { status: true },
    });
    if (open?.status === 'VERIFIED')
      throw new ConflictException('This organisation is already verified');
    if (open?.status === 'PENDING')
      throw new ConflictException('This organisation is already being reviewed');
  }

  private async member(userId: string, organisationId: string) {
    const me = await this.prisma.organisationMember.findUnique({
      where: { organisationId_userId: { organisationId, userId } },
    });
    if (!me) throw new NotFoundException('Organisation not found');
    return me;
  }

  private async manager(userId: string, organisationId: string) {
    const me = await this.member(userId, organisationId);
    if (me.role !== 'OWNER' && me.role !== 'ADMIN')
      throw new ForbiddenException('Only owners and admins can verify the organisation');
    return me;
  }

  private present(r: OrganisationVerification) {
    return {
      id: r.id,
      status: r.status,
      registrationType: r.registrationType,
      registrationNumber: r.registrationNumber,
      registeredName: r.registeredName,
      verifiedName: r.verifiedName,
      reason: r.reason,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
    };
  }

  private presentAdmin(r: OrganisationVerification) {
    return { ...this.present(r), updatedAt: r.updatedAt };
  }
}
