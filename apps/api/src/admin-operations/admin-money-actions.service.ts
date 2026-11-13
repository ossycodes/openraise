import { requireAdministrator } from '../auth/admin-authorization.js';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { auditActor } from '../audit/actor.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type VerifiedPayout,
} from '../payments/payment-provider.js';
import { PaymentProviderError } from '../payments/provider-http.js';
import { WithdrawalSettlement } from '../withdrawals/withdrawal-settlement.js';
import { WithdrawalsService } from '../withdrawals/withdrawals.service.js';
import { PaymentEventProcessor } from '../webhooks/payment-event.processor.js';
import type { MoneyAction } from './admin-operations.schemas.js';
@Injectable()
export class AdminMoneyActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: WithdrawalSettlement,
    private readonly withdrawals: WithdrawalsService,
    private readonly processor: PaymentEventProcessor,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider | null,
  ) {}
  private selected(name: string) {
    if (!this.provider || this.provider.name !== name)
      throw new ConflictException(
        'This record belongs to an inactive payment provider',
      );
    return this.provider;
  }
  private version(actual: Date, expected: string) {
    if (actual.toISOString() !== expected)
      throw new ConflictException('Record changed. Reload before deciding.');
  }
  async action(actor: AuthUser, kind: string, id: string, input: MoneyAction) {
    try {
      if (kind === 'WITHDRAWAL') return await this.withdrawal(actor, id, input);
      if (kind === 'DONATION') return await this.donation(actor, id, input);
      if (kind === 'EVENT') return await this.event(actor, id, input);
      throw new NotFoundException();
    } catch (error) {
      if (error instanceof PaymentProviderError)
        throw new ServiceUnavailableException(
          'Provider evidence could not be confirmed. No payout was resent. Reload before trying again.',
        );
      throw error;
    }
  }
  private matching(
    w: {
      reference: string;
      providerPayoutId: string | null;
      netPaidOut: bigint;
      currency: string;
      recipientId: string;
    },
    result: VerifiedPayout,
  ) {
    if (
      result.reference !== w.reference ||
      result.amount !== w.netPaidOut ||
      result.currency !== w.currency ||
      result.recipientId !== w.recipientId ||
      (w.providerPayoutId && result.id !== w.providerPayoutId) ||
      !result.id
    )
      throw new ConflictException(
        'Provider evidence does not match the payout reference, destination, currency and amount',
      );
    if (result.status === 'unknown')
      throw new ConflictException('Provider payout outcome is still unknown');
  }
  private async withdrawal(actor: AuthUser, id: string, input: MoneyAction) {
    if (!['VERIFY', 'RETRY'].includes(input.action))
      throw new ConflictException('Choose provider verification or retry');
    const found = await this.prisma.withdrawal.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!found) throw new NotFoundException('Withdrawal not found');
    if (found.userId === actor.id)
      throw new ForbiddenException(
        'Another administrator must reconcile your payout',
      );
    if (input.action === 'RETRY') {
      const existing = await this.prisma.withdrawal.findUnique({
        where: { retryOfId: id },
        select: { id: true },
      });
      if (existing) return { retryId: existing.id, replayed: true };
    }
    this.version(found.updatedAt, input.expectedUpdatedAt);
    const provider = this.selected(found.provider);
    if (!provider.verifyPayout)
      throw new ConflictException('This provider cannot verify payouts');
    const result = await provider.verifyPayout(
      found.reference,
      found.providerPayoutId,
    );
    this.matching(found, result);
    if (input.action === 'RETRY') {
      if (
        !['failed', 'reversed'].includes(result.status) ||
        !['FAILED', 'REVERSED'].includes(found.status) ||
        found.reconciliationRequired ||
        !found.reversalTransactionId
      )
        throw new ConflictException(
          'Verify and reconcile the returned payout before retrying',
        );
      const retry = await this.withdrawals.request(
        {
          id: found.user.id,
          email: found.user.email,
          role: found.user.role,
          emailVerified: found.user.emailVerifiedAt !== null,
        },
        found.campaignId,
        {
          amount: found.amount.toString(),
          expectedFee: found.fee.toString(),
          bankAccountId: found.bankAccountId,
        },
        randomUUID(),
        {
          originalId: id,
          actorId: actor.id,
          reason: input.reason,
          expectedUpdatedAt: input.expectedUpdatedAt,
        },
      );
      return { retryId: retry.id, status: retry.status };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Campaign" WHERE "id" = ${found.campaignId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Withdrawal" WHERE "id" = ${id} FOR UPDATE`;
      await requireAdministrator(tx, actor.id);
      const w = await tx.withdrawal.findUniqueOrThrow({ where: { id } });
      this.version(w.updatedAt, input.expectedUpdatedAt);
      this.matching(w, result);
      await auditActor(tx, actor.id);
      const state =
        result.status === 'succeeded'
          ? 'SUCCEEDED'
          : result.status === 'failed'
            ? 'FAILED'
            : result.status === 'reversed'
              ? 'REVERSED'
              : 'PENDING';
      if (state === 'PENDING') {
        if (['SUCCEEDED', 'FAILED', 'REVERSED'].includes(w.status))
          throw new ConflictException(
            'Pending evidence cannot replace a final payout state',
          );
        await tx.withdrawal.update({
          where: { id },
          data: {
            providerPayoutId: result.id,
            status: 'PENDING',
            reconciliationRequired: false,
            reason: 'admin-provider-verified-pending',
          },
        });
      } else {
        if (
          w.status === state ||
          (['FAILED', 'REVERSED'].includes(w.status) &&
            ['FAILED', 'REVERSED'].includes(state))
        ) {
          await tx.withdrawal.update({
            where: { id },
            data: {
              providerPayoutId: result.id,
              reconciliationRequired: false,
              reason: 'admin-provider-verified-final',
            },
          });
        } else {
          await tx.withdrawal.update({
            where: { id },
            data: { providerPayoutId: result.id },
          });
          const outcome = await this.settlement.apply(
            tx,
            w,
            state,
            new Date(),
            'admin-provider-verified',
          );
          if (outcome === 'conflicting-terminal-event')
            throw new ConflictException(
              'Provider evidence conflicts with the final ledger state; investigate before changing it',
            );
        }
      }
      const reconciled = await tx.withdrawal.findUniqueOrThrow({
        where: { id },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'WITHDRAWAL_RECONCILED',
          targetType: 'Withdrawal',
          targetId: id,
          subjectId: w.userId,
          before: { status: w.status },
          after: { status: reconciled.status, reason: input.reason },
        },
      });
    });
    return { verified: true, providerStatus: result.status };
  }
  private async donation(actor: AuthUser, id: string, input: MoneyAction) {
    if (input.action !== 'VERIFY')
      throw new ConflictException(
        'Donations support provider verification only',
      );
    const d = await this.prisma.donation.findUnique({
      where: { id },
      include: { campaign: { select: { ownerId: true } } },
    });
    if (!d) throw new NotFoundException('Donation not found');
    if (d.campaign.ownerId === actor.id || d.donorUserId === actor.id)
      throw new ForbiddenException(
        'Another administrator must reconcile your donation',
      );
    this.version(d.updatedAt, input.expectedUpdatedAt);
    const provider = this.selected(d.provider);
    const identifier =
      provider.name === 'paystack' ? d.reference : d.providerCheckoutId;
    if (!identifier)
      throw new ConflictException(
        'No provider checkout identifier is available; investigate the original request',
      );
    const result = await provider.verifyPayment(identifier);
    if (
      result.reference !== d.reference ||
      result.amount !== d.totalCharged ||
      result.currency !== d.currency ||
      (d.providerPaymentId && result.id !== d.providerPaymentId)
    )
      throw new ConflictException(
        'Provider payment evidence does not match this donation',
      );
    // Failed attempts can later succeed; only authoritative success settles a donation.
    if (result.status !== 'succeeded' || !result.id)
      throw new ConflictException(
        'Provider has not confirmed a successful payment',
      );
    const event = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Donation" WHERE "id" = ${id} FOR UPDATE`;
      await requireAdministrator(tx, actor.id);
      const current = await tx.donation.findUniqueOrThrow({ where: { id } });
      this.version(current.updatedAt, input.expectedUpdatedAt);
      const row = await tx.paymentEvent.upsert({
        where: {
          provider_eventId: {
            provider: d.provider,
            eventId: `admin-verify:${id}:${result.id}`,
          },
        },
        update: {},
        create: {
          provider: d.provider,
          eventId: `admin-verify:${id}:${result.id}`,
          rawBody: new Uint8Array(),
          type: 'payment.succeeded',
          resourceId: result.id,
          reference: result.reference,
          amount: result.amount,
          currency: result.currency,
          occurredAt: new Date(),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'DONATION_VERIFICATION_REQUESTED',
          targetType: 'Donation',
          targetId: id,
          after: { eventId: row.id, reason: input.reason },
        },
      });
      return row;
    });
    await this.processor.process(event.id);
    return { verified: true, eventId: event.id };
  }
  private async event(actor: AuthUser, id: string, input: MoneyAction) {
    if (input.action !== 'REPROCESS')
      throw new ConflictException('Choose reprocess for stored events');
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "PaymentEvent" WHERE "id" = ${id} FOR UPDATE`;
      await requireAdministrator(tx, actor.id);
      const row = await tx.paymentEvent.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Event not found');
      const [donation, withdrawal] = await Promise.all([
        tx.donation.findFirst({
          where: {
            provider: row.provider,
            OR: [
              ...(row.reference ? [{ reference: row.reference }] : []),
              ...(row.resourceId
                ? [
                    { providerPaymentId: row.resourceId },
                    { providerCheckoutId: row.resourceId },
                  ]
                : []),
            ],
          },
          select: {
            donorUserId: true,
            campaign: { select: { ownerId: true } },
          },
        }),
        tx.withdrawal.findFirst({
          where: {
            provider: row.provider,
            OR: [
              ...(row.reference ? [{ reference: row.reference }] : []),
              ...(row.resourceId ? [{ providerPayoutId: row.resourceId }] : []),
            ],
          },
          select: { userId: true },
        }),
      ]);
      if (
        donation?.donorUserId === actor.id ||
        donation?.campaign.ownerId === actor.id ||
        withdrawal?.userId === actor.id
      )
        throw new ForbiddenException(
          'Another administrator must reconcile your records',
        );
      this.selected(row.provider);
      this.version(row.processedAt ?? row.receivedAt, input.expectedUpdatedAt);
      if (row.outcome === 'PROCESSED')
        throw new ConflictException(
          'This event was already processed successfully',
        );
      if (
        ![
          'payment.succeeded',
          'payment.failed',
          'checkout.expired',
          'payout.succeeded',
          'payout.failed',
          'payout.pending',
          'payout.reversed',
        ].includes(row.type ?? '')
      )
        throw new ConflictException('Unsupported event type');
      await tx.paymentEvent.update({
        where: { id },
        data: { processedAt: null, outcome: null, reason: null },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'PAYMENT_EVENT_REPROCESS_REQUESTED',
          targetType: 'PaymentEvent',
          targetId: id,
          before: { outcome: row.outcome },
          after: { reason: input.reason },
        },
      });
    });
    await this.processor.process(id);
    return { reprocessed: true };
  }
}
