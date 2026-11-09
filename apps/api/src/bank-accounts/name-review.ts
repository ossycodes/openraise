import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { withAuditActor } from '../audit/actor.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { Env } from '../config/env.js';
import type {
  PayoutNameReview,
  Prisma,
} from '../generated/prisma/client.js';
import { KycService } from '../kyc/kyc.service.js';
import { MailService } from '../mail/mail.service.js';
import { payoutNameReviewEmail } from '../mail/templates.js';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service.js';
import { namesMatch } from './name-match.js';

const PAGE_SIZE = 20;

export const nameReviewRequestSchema = z
  .object({ explanation: z.string().trim().min(10).max(500) })
  .strict();
export type NameReviewRequest = z.infer<typeof nameReviewRequestSchema>;

export const nameReviewQueueSchema = z.object({
  status: z
    .enum(['PENDING', 'APPROVED', 'DECLINED', 'CANCELLED'])
    .default('PENDING'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export type NameReviewQueue = z.infer<typeof nameReviewQueueSchema>;

export const nameReviewDecisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'DECLINE']),
    reason: z.string().trim().min(5).max(500).optional(),
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict()
  .refine((v) => v.decision === 'APPROVE' || !!v.reason, {
    path: ['reason'],
    message: 'Tell the creator why',
  });
export type NameReviewDecision = z.infer<typeof nameReviewDecisionSchema>;

/**
 * How a payout account's name stands against the owner's verified name:
 * MATCHES and APPROVED can be paid; MISMATCH needs a review; UNVERIFIED means
 * the owner isn't verified yet, so nothing can be paid.
 */
export type NameCheck = 'MATCHES' | 'APPROVED' | 'MISMATCH' | 'UNVERIFIED';

/**
 * Can withdrawals go to this account? Its name must match the verified name,
 * or an administrator must have approved this account for this same verified
 * name. Pass the transaction the withdrawal runs in.
 */
export async function accountPayable(
  db: Prisma.TransactionClient,
  bank: { id: string; accountName: string },
  verifiedName: string,
): Promise<boolean> {
  if (namesMatch(verifiedName, bank.accountName)) return true;
  const approved = await db.payoutNameReview.findFirst({
    where: {
      bankAccountId: bank.id,
      status: 'APPROVED',
      verifiedName,
      accountName: bank.accountName,
    },
    select: { id: true },
  });
  return !!approved;
}

export function presentOwnReview(r: PayoutNameReview) {
  return {
    id: r.id,
    status: r.status,
    explanation: r.explanation,
    reason: r.reason,
    createdAt: r.createdAt,
    decidedAt: r.decidedAt,
  };
}

const masked = (n: string) => `******${n.slice(-4)}`;

@Injectable()
export class NameReviewService {
  private readonly logger = new Logger(NameReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kyc: KycService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Name standing and latest review for each of a user's accounts. */
  async checks(
    userId: string,
    accounts: { id: string; accountName: string }[],
  ) {
    const verifiedName = await this.kyc.verifiedName(userId);
    const reviews = accounts.length
      ? await this.prisma.payoutNameReview.findMany({
          where: { bankAccountId: { in: accounts.map((a) => a.id) } },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    return new Map(
      accounts.map((a) => {
        const own = reviews.filter((r) => r.bankAccountId === a.id);
        const latest = own.find((r) => r.status !== 'CANCELLED') ?? null;
        let nameCheck: NameCheck;
        if (!verifiedName) nameCheck = 'UNVERIFIED';
        else if (namesMatch(verifiedName, a.accountName)) nameCheck = 'MATCHES';
        else if (
          own.some(
            (r) =>
              r.status === 'APPROVED' &&
              r.verifiedName === verifiedName &&
              r.accountName === a.accountName,
          )
        )
          nameCheck = 'APPROVED';
        else nameCheck = 'MISMATCH';
        return [
          a.id,
          {
            nameCheck,
            nameReview: latest ? presentOwnReview(latest) : null,
          },
        ] as const;
      }),
    );
  }

  /** The owner asks an administrator to approve an account in another name. */
  async request(user: AuthUser, bankAccountId: string, input: NameReviewRequest) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, userId: user.id, removedAt: null },
    });
    if (!account) throw new NotFoundException('Payout account not found');
    const verifiedName = await this.kyc.requireVerified(
      user.id,
      'Verify your identity before asking for a review',
    );
    if (await accountPayable(this.prisma, account, verifiedName))
      throw new ConflictException(
        'This account can already receive your withdrawals',
      );
    try {
      const row = await withAuditActor(this.prisma, user.id, (tx) =>
        tx.payoutNameReview.create({
          data: {
            bankAccountId: account.id,
            userId: user.id,
            explanation: input.explanation,
            accountName: account.accountName,
            verifiedName,
          },
        }),
      );
      return presentOwnReview(row);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException(
          'A review of this account is already waiting',
        );
      throw error;
    }
  }

  /** Cancel what's waiting when the owner removes the account. */
  async cancelForAccount(tx: Prisma.TransactionClient, bankAccountId: string) {
    await tx.payoutNameReview.updateMany({
      where: { bankAccountId, status: 'PENDING' },
      data: { status: 'CANCELLED', decidedAt: new Date() },
    });
  }

  async queue(query: NameReviewQueue) {
    const where = { status: query.status };
    const [items, total, pending] = await Promise.all([
      this.prisma.payoutNameReview.findMany({
        where,
        orderBy:
          query.status === 'PENDING'
            ? [{ createdAt: 'asc' }, { id: 'asc' }]
            : [{ decidedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          user: { select: { name: true, email: true } },
          bankAccount: { select: { bankName: true, accountNumber: true } },
        },
      }),
      this.prisma.payoutNameReview.count({ where }),
      this.prisma.payoutNameReview.count({ where: { status: 'PENDING' } }),
    ]);
    return {
      items: items.map((r) => ({
        ...this.presentAdmin(r),
        user: r.user,
        account: `${r.bankAccount.bankName} ${masked(r.bankAccount.accountNumber)}`,
      })),
      total,
      pending,
      page: query.page,
      limit: PAGE_SIZE,
    };
  }

  async detail(id: string) {
    const row = await this.prisma.payoutNameReview.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, createdAt: true } },
        bankAccount: true,
        reviewer: { select: { name: true } },
      },
    });
    if (!row) throw new NotFoundException('Review not found');
    const [currentVerifiedName, history, withdrawals] = await Promise.all([
      this.kyc.verifiedName(row.userId),
      this.prisma.payoutNameReview.findMany({
        where: { bankAccountId: row.bankAccountId, id: { not: row.id } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { reviewer: { select: { name: true } } },
      }),
      this.prisma.withdrawal.count({ where: { bankAccountId: row.bankAccountId } }),
    ]);
    const a = row.bankAccount;
    return {
      review: { ...this.presentAdmin(row), reviewer: row.reviewer },
      user: row.user,
      account: {
        id: a.id,
        bankName: a.bankName,
        maskedAccountNumber: masked(a.accountNumber),
        accountName: a.accountName,
        createdAt: a.createdAt,
        removed: !!a.removedAt,
        withdrawals,
      },
      currentVerifiedName,
      history: history.map((h) => ({
        ...this.presentAdmin(h),
        reviewer: h.reviewer,
      })),
    };
  }

  async decide(admin: AuthUser, id: string, input: NameReviewDecision) {
    const row = await this.prisma.payoutNameReview.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true } },
        bankAccount: true,
      },
    });
    if (!row) throw new NotFoundException('Review not found');
    if (row.userId === admin.id)
      throw new ForbiddenException(
        'Another administrator must review your own payout account',
      );
    if (row.status !== 'PENDING')
      throw new ConflictException('This review has already been decided');
    const approve = input.decision === 'APPROVE';
    if (approve) {
      if (row.bankAccount.removedAt)
        throw new ConflictException('This payout account was removed');
      if ((await this.kyc.verifiedName(row.userId)) !== row.verifiedName)
        throw new ConflictException(
          'Their verified name changed after they asked. Decline and ask them to request again.',
        );
    }
    // Conditional on the version the reviewer saw, like identity decisions.
    const claimed = await withAuditActor(this.prisma, admin.id, (tx) =>
      tx.payoutNameReview.updateMany({
        where: {
          id,
          status: 'PENDING',
          updatedAt: new Date(input.expectedUpdatedAt),
        },
        data: {
          status: approve ? 'APPROVED' : 'DECLINED',
          reason: approve ? null : input.reason!,
          reviewerId: admin.id,
          decidedAt: new Date(),
        },
      }),
    );
    if (claimed.count === 0)
      throw new ConflictException(
        'This review changed while you were looking at it. Reload and check again.',
      );

    try {
      await this.mail.send(
        payoutNameReviewEmail(
          row.user.name,
          row.user.email,
          `${row.bankAccount.bankName} ${masked(row.bankAccount.accountNumber)}`,
          approve ? null : input.reason!,
          new URL(
            '/dashboard/payouts',
            this.config.get('WEB_URL', { infer: true }),
          ).toString(),
        ),
      );
    } catch (error) {
      // The decision stands; the payouts page shows it either way.
      this.logger.warn(`Payout name review email not sent: ${String(error)}`);
    }
    return this.detail(id);
  }

  private presentAdmin(r: PayoutNameReview) {
    return {
      ...presentOwnReview(r),
      accountName: r.accountName,
      verifiedName: r.verifiedName,
      updatedAt: r.updatedAt,
    };
  }
}
