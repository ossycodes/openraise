import { WithdrawalEvents } from '../withdrawals/withdrawal-events.js';
import { Injectable } from '@nestjs/common';
import { isCurrency } from '@openraise/shared';
import { donationEntries } from '../ledger/ledger.entries.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { NotificationScheduler } from '../notifications/notification-scheduler.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PaymentEventProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationScheduler,
    private readonly withdrawals: WithdrawalEvents,
  ) {}

  async process(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "PaymentEvent" WHERE "id" = ${id} FOR UPDATE`;
      const event = await tx.paymentEvent.findUnique({ where: { id } });
      if (!event || event.processedAt) return;
      const finish = (outcome: string, reason: string) =>
        tx.paymentEvent.update({
          where: { id },
          data: { outcome, reason, processedAt: new Date() },
        });
      if (
        [
          'payout.succeeded',
          'payout.failed',
          'payout.pending',
          'payout.reversed',
        ].includes(event.type ?? '')
      ) {
        const result = await this.withdrawals.process(tx, event);
        await finish(result.outcome, result.reason);
        return;
      }
      if (
        !['payment.succeeded', 'payment.failed', 'checkout.expired'].includes(
          event.type ?? '',
        )
      ) {
        await finish('IGNORED', 'unsupported-domain-event');
        return;
      }
      const match = event.reference
        ? { provider: event.provider, reference: event.reference }
        : event.type === 'checkout.expired' && event.resourceId
          ? { provider: event.provider, providerCheckoutId: event.resourceId }
          : null;
      if (!match) {
        await finish('IGNORED', 'missing-reference');
        return;
      }
      const found = await tx.donation.findFirst({ where: match });
      if (!found) {
        await finish('IGNORED', 'unknown-donation');
        return;
      }
      await tx.$queryRaw`SELECT "id" FROM "Donation" WHERE "id" = ${found.id} FOR UPDATE`;
      const donation = await tx.donation.findUniqueOrThrow({
        where: { id: found.id },
      });
      if (
        event.type !== 'checkout.expired' &&
        (event.amount !== donation.totalCharged ||
          event.currency !== donation.currency)
      ) {
        await finish('REJECTED', 'amount-or-currency-mismatch');
        return;
      }
      if (donation.status === 'SUCCEEDED') {
        await finish(
          event.type === 'payment.succeeded' &&
            donation.providerPaymentId !== event.resourceId
            ? 'REJECTED'
            : 'IGNORED',
          event.type === 'payment.succeeded' &&
            donation.providerPaymentId !== event.resourceId
            ? 'additional-payment-needs-reconciliation'
            : 'already-succeeded',
        );
        return;
      }
      if (donation.stateEventAt && event.occurredAt < donation.stateEventAt) {
        await finish('IGNORED', 'older-than-stored-state');
        return;
      }
      if (event.type === 'checkout.expired') {
        if (
          donation.providerCheckoutId &&
          donation.providerCheckoutId !== event.resourceId
        ) {
          await finish('REJECTED', 'checkout-id-mismatch');
          return;
        }
        await tx.donation.update({
          where: { id: donation.id },
          data: { status: 'EXPIRED', stateEventAt: event.occurredAt },
        });
      } else if (event.type === 'payment.failed') {
        // A failed Bachs attempt may be followed by a later successful attempt.
        await tx.donation.update({
          where: { id: donation.id },
          data: { status: 'FAILED', stateEventAt: event.occurredAt },
        });
      } else {
        if (!isCurrency(donation.currency) || !event.resourceId)
          throw new Error('Invalid persisted payment event');
        const posting = await this.ledger.postInTransaction(tx, {
          kind: 'DONATION',
          idempotencyKey: `donation:${donation.id}`,
          currency: donation.currency,
          description: 'Verified donation payment',
          entries: donationEntries(
            donation.campaignId,
            donation.currency,
            donation,
          ).filter((entry) => entry.amount !== 0n),
        });
        const settled = await tx.donation.update({
          where: { id: donation.id },
          data: {
            status: 'SUCCEEDED',
            providerPaymentId: event.resourceId,
            ledgerTransactionId: posting.transactionId,
            succeededAt: event.occurredAt,
            stateEventAt: event.occurredAt,
          },
        });
        await this.notifications.schedule(tx, settled);
      }
      await finish('PROCESSED', 'donation-state-updated');
    });
  }
}
