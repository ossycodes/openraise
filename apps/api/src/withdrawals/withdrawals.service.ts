import { withdrawalReviewWhere } from './withdrawal-review.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/auth.types.js';
import { FeesService } from '../fees/fees.service.js';
import { namesMatch } from '../bank-accounts/name-match.js';
import { KycService } from '../kyc/kyc.service.js';
import type { Prisma, Withdrawal } from '../generated/prisma/client.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { accountKey } from '../ledger/ledger.entries.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../payments/payment-provider.js';
import { PaymentProviderError } from '../payments/provider-http.js';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service.js';
import { idempotencyKeySchema } from '../donations/donations.schemas.js';
import { withdrawalHold } from './withdrawal.entries.js';
import { WithdrawalSettlement } from './withdrawal-settlement.js';
import type { WithdrawalInput } from './withdrawals.schemas.js';

@Injectable()
export class WithdrawalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly fees: FeesService,
    private readonly settlement: WithdrawalSettlement,
    private readonly kyc: KycService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider | null,
  ) {}
  private public(w: Withdrawal) {
    return {
      id: w.id,
      campaignId: w.campaignId,
      bankAccountId: w.bankAccountId,
      bankName: w.bankName,
      accountName: w.accountName,
      maskedAccountNumber: `******${w.accountLast4}`,
      currency: w.currency,
      amount: w.amount.toString(),
      fee: w.fee.toString(),
      netPaidOut: w.netPaidOut.toString(),
      status: w.status,
      reconciliationRequired:
        w.reconciliationRequired ||
        (w.status === 'INITIALIZING' &&
          Date.now() - w.createdAt.getTime() > 60000),
      reason: w.reason,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    };
  }
  private breakdown(amount: string) {
    const value = BigInt(amount);
    if (value > 9223372036854775807n || value <= 0n)
      throw new BadRequestException('Invalid amount');
    try {
      return this.fees.withdrawal(value);
    } catch {
      throw new BadRequestException(
        'Withdrawal must exceed the withdrawal fee',
      );
    }
  }
  private async owned(
    user: AuthUser,
    campaignId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const campaign = await tx.campaign.findFirst({
      where: { id: campaignId, ownerId: user.id },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }
  async quote(user: AuthUser, campaignId: string, amount: string) {
    const c = await this.owned(user, campaignId);
    const fees = this.breakdown(amount);
    const balances = await this.ledger.campaignBalances(c.id);
    return {
      amount: fees.amount.toString(),
      fee: fees.fee.toString(),
      netPaidOut: fees.netPaidOut.toString(),
      currency: c.currency,
      availableBalance: (
        balances.find((b) => b.currency === c.currency)?.balance ?? 0n
      ).toString(),
      payoutsFrozen: c.payoutsFrozen,
      payoutFreezeReason: c.payoutFreezeReason,
      payoutsSupported: !!this.provider && c.currency === 'NGN',
    };
  }
  async list(user: AuthUser, campaignId: string, page: number) {
    await this.owned(user, campaignId);
    const rows = await this.prisma.withdrawal.findMany({
      where: { campaignId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * 20,
      take: 21,
    });
    return {
      items: rows.slice(0, 20).map((w) => this.public(w)),
      page,
      hasMore: rows.length > 20,
    };
  }
  async publicHistory(slug: string, page: number) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { slug, status: { in: ['ACTIVE', 'PAUSED', 'ENDED'] } },
      select: { id: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const rows = await this.prisma.withdrawal.findMany({
      where: { campaignId: campaign.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * 20,
      take: 21,
      select: {
        id: true,
        amount: true,
        fee: true,
        netPaidOut: true,
        currency: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      items: rows.slice(0, 20).map((w) => ({
        ...w,
        amount: w.amount.toString(),
        fee: w.fee.toString(),
        netPaidOut: w.netPaidOut.toString(),
      })),
      page,
      hasMore: rows.length > 20,
    };
  }
  async get(user: AuthUser, id: string) {
    const w = await this.prisma.withdrawal.findFirst({
      where: { id, userId: user.id },
    });
    if (!w) throw new NotFoundException('Withdrawal not found');
    return this.public(w);
  }
  async request(
    user: AuthUser,
    campaignId: string,
    input: WithdrawalInput,
    key: string | undefined,
  ) {
    const parsed = idempotencyKeySchema.safeParse(key);
    if (!parsed.success)
      throw new BadRequestException('Use a random UUID v4 Idempotency-Key');
    const hash = createHash('sha256')
      .update(`${user.id}:${parsed.data}`)
      .digest('hex');
    const replay = (w: Withdrawal) => {
      if (
        w.campaignId !== campaignId ||
        w.bankAccountId !== input.bankAccountId ||
        w.amount !== BigInt(input.amount) ||
        w.fee !== BigInt(input.expectedFee)
      )
        throw new ConflictException(
          'Idempotency key was used for a different withdrawal',
        );
      return this.public(w);
    };
    const existing = await this.prisma.withdrawal.findUnique({
      where: { idempotencyKeyHash: hash },
    });
    if (existing) return replay(existing);
    if (!user.emailVerified)
      throw new ForbiddenException('Verify your email before withdrawing');
    const verifiedName = await this.kyc.requireVerified(
      user.id,
      'Verify your identity before withdrawing',
    );
    const provider = this.provider;
    if (!provider)
      throw new ServiceUnavailableException('Payouts are not configured');
    const fees = this.breakdown(input.amount);
    if (fees.fee !== BigInt(input.expectedFee))
      throw new ConflictException(
        'Withdrawal fee changed; request a new quote',
      );
    if (
      provider.name === 'paystack' &&
      fees.netPaidOut > BigInt(Number.MAX_SAFE_INTEGER)
    )
      throw new BadRequestException('Amount is too large for this provider');
    let reserved: Withdrawal | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        reserved = await this.prisma.$transaction(async (tx) => {
          // Reservations and admin freezes serialize on the campaign. Never lock across provider I/O.
          await tx.$queryRaw`SELECT "id" FROM "Campaign" WHERE "id" = ${campaignId} FOR UPDATE`;
          const c = await this.owned(user, campaignId, tx);
          const duplicate = await tx.withdrawal.findUnique({
            where: { idempotencyKeyHash: hash },
          });
          if (duplicate) {
            replay(duplicate);
            return duplicate;
          }
          if (c.payoutsFrozen)
            throw new ForbiddenException('Campaign payouts are frozen');
          if (!['ACTIVE', 'PAUSED', 'ENDED'].includes(c.status))
            throw new ConflictException(
              'Campaign must have been published before withdrawing',
            );
          if (c.currency !== 'NGN')
            throw new BadRequestException(
              'Only NGN bank withdrawals are supported; currency conversion is not available',
            );
          await tx.$queryRaw`SELECT "id" FROM "BankAccount" WHERE "id" = ${input.bankAccountId} FOR UPDATE`;
          const bank = await tx.bankAccount.findFirst({
            where: {
              id: input.bankAccountId,
              userId: user.id,
              removedAt: null,
            },
          });
          if (!bank) throw new NotFoundException('Payout account not found');
          if (
            bank.provider !== provider.name ||
            bank.currency !== c.currency ||
            bank.country !== 'NG' ||
            !bank.recipientUsable
          )
            throw new ConflictException(
              'Payout account is not eligible for this provider and currency',
            );
          // Money only goes to an account in the verified person's name.
          if (!namesMatch(verifiedName, bank.accountName))
            throw new ConflictException({
              message:
                "This payout account's name doesn't match your verified name",
              code: 'ACCOUNT_NAME_MISMATCH',
            });
          if (bank.payoutsAvailableAt.getTime() > Date.now())
            throw new ConflictException(
              'New payout accounts have a 24-hour withdrawal hold',
            );
          const key = accountKey({
            type: 'CAMPAIGN_WALLET',
            currency: 'NGN',
            campaignId,
          });
          const [balance] = await tx.$queryRaw<
            { balance: bigint }[]
          >`SELECT COALESCE(-SUM(e."amount"),0)::bigint AS "balance" FROM "LedgerEntry" e JOIN "LedgerAccount" a ON a."id"=e."accountId" WHERE a."key"=${key}`;
          if ((balance?.balance ?? 0n) < fees.amount)
            throw new ConflictException(
              'Insufficient available campaign balance',
            );
          const id = randomUUID();
          const hold = await this.ledger.postInTransaction(tx, {
            kind: 'WITHDRAWAL_HOLD',
            idempotencyKey: `withdrawal:${id}:hold`,
            currency: 'NGN',
            description: 'Reserve campaign withdrawal',
            entries: withdrawalHold(campaignId, 'NGN', fees.amount),
          });
          return tx.withdrawal.create({
            data: {
              id,
              campaignId,
              userId: user.id,
              bankAccountId: bank.id,
              bankName: bank.bankName,
              accountName: bank.accountName,
              accountLast4: bank.accountNumber.slice(-4),
              recipientId: bank.recipientId,
              provider: provider.name,
              reference: `withdrawal_${id}`,
              idempotencyKeyHash: hash,
              currency: 'NGN',
              ...fees,
              holdTransactionId: hold.transactionId,
            },
          });
        });
        break;
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === 2) throw error;
        const duplicate = await this.prisma.withdrawal.findUnique({
          where: { idempotencyKeyHash: hash },
        });
        if (duplicate) return replay(duplicate);
      }
    }
    if (!reserved)
      throw new ConflictException('Retry the same withdrawal request');
    // Atomically claim dispatch once. Replays never create another provider request.
    // A crash after this claim requires reconciliation, not an automatic retry.
    const claimed = await this.prisma.withdrawal.updateMany({
      where: { id: reserved.id, status: 'INITIALIZING', reason: null },
      data: { reason: 'dispatch-started' },
    });
    if (!claimed.count) return this.get(user, reserved.id);
    try {
      const operation = await provider.createPayout({
        amount: reserved.netPaidOut,
        currency: 'NGN',
        recipientId: reserved.recipientId,
        reference: reserved.reference,
        reason: 'Campaign payout',
      });
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Campaign" WHERE "id"=${campaignId} FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Withdrawal" WHERE "id"=${reserved!.id} FOR UPDATE`;
        const w = await tx.withdrawal.findUniqueOrThrow({
          where: { id: reserved!.id },
        });
        if (
          operation.reference !== w.reference ||
          !operation.id ||
          (w.providerPayoutId && w.providerPayoutId !== operation.id)
        ) {
          await tx.withdrawal.update({
            where: { id: w.id },
            data: {
              reconciliationRequired: true,
              reason: 'provider-response-mismatch',
              ...(['INITIALIZING', 'PENDING', 'UNCERTAIN'].includes(w.status)
                ? { status: 'UNCERTAIN' as const }
                : {}),
            },
          });
          return;
        }
        await tx.withdrawal.update({
          where: { id: w.id },
          data: { providerPayoutId: operation.id },
        });
        if (['SUCCEEDED', 'FAILED', 'REVERSED'].includes(w.status)) return;
        if (operation.status === 'failed')
          await this.settlement.apply(
            tx,
            w,
            'FAILED',
            new Date(),
            'provider-rejected-payout',
          );
        else
          await tx.withdrawal.update({
            where: { id: w.id },
            data: {
              status: operation.status === 'unknown' ? 'UNCERTAIN' : 'PENDING',
              reconciliationRequired: operation.status === 'unknown',
              reason:
                operation.status === 'unknown'
                  ? 'provider-status-unknown'
                  : 'awaiting-provider-confirmation',
            },
          });
      });
    } catch (error) {
      // Even a DB error after a successful send must retain the hold. Only explicit,
      // unambiguous non-acceptance from an adapter is safe to reverse automatically.
      const rejected =
        error instanceof PaymentProviderError &&
        !error.uncertain &&
        ['invalid-input', 'unsupported', 'http-error'].includes(error.code);
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Campaign" WHERE "id"=${campaignId} FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Withdrawal" WHERE "id"=${reserved!.id} FOR UPDATE`;
        const w = await tx.withdrawal.findUniqueOrThrow({
          where: { id: reserved!.id },
        });
        if (!['INITIALIZING', 'PENDING', 'UNCERTAIN'].includes(w.status))
          return;
        if (rejected)
          await this.settlement.apply(
            tx,
            w,
            'FAILED',
            new Date(),
            'provider-rejected-request',
          );
        else
          await tx.withdrawal.update({
            where: { id: w.id },
            data: {
              status: 'UNCERTAIN',
              reconciliationRequired: true,
              reason: 'provider-outcome-uncertain',
            },
          });
      });
    }
    return this.get(user, reserved.id);
  }
  async reviewQueue(page: number) {
    const rows = await this.prisma.withdrawal.findMany({
      where: withdrawalReviewWhere(),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * 20,
      take: 21,
    });
    return {
      items: rows.slice(0, 20).map((w) => ({
        ...this.public(w),
        reference: w.reference,
        provider: w.provider,
        providerPayoutId: w.providerPayoutId,
      })),
      page,
      hasMore: rows.length > 20,
    };
  }
  async freeze(
    user: AuthUser,
    campaignId: string,
    frozen: boolean,
    reason: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Campaign" WHERE "id"=${campaignId} FOR UPDATE`;
      if (!(await tx.campaign.findUnique({ where: { id: campaignId } })))
        throw new NotFoundException('Campaign not found');
      await tx.payoutFreezeEvent.create({
        data: { campaignId, actorId: user.id, frozen, reason },
      });
      await tx.campaign.update({
        where: { id: campaignId },
        data: {
          payoutsFrozen: frozen,
          payoutFreezeReason: frozen ? reason : null,
        },
      });
      return {
        payoutsFrozen: frozen,
        payoutFreezeReason: frozen ? reason : null,
      };
    });
  }
}
