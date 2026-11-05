import { Injectable } from '@nestjs/common';
import type { PaymentEvent, Prisma } from '../generated/prisma/client.js';
import { WithdrawalSettlement } from './withdrawal-settlement.js';

@Injectable()
export class WithdrawalEvents {
  constructor(private readonly settlement: WithdrawalSettlement) {}
  async process(tx: Prisma.TransactionClient, event: PaymentEvent) {
    const result = (outcome: string, reason: string) => ({ outcome, reason });
    if (!event.reference || !event.resourceId)
      return result('IGNORED', 'missing-payout-reference');
    const found = await tx.withdrawal.findFirst({
      where: { reference: event.reference, provider: event.provider },
    });
    if (!found) return result('IGNORED', 'unknown-withdrawal');
    await tx.$queryRaw`SELECT "id" FROM "Campaign" WHERE "id"=${found.campaignId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Withdrawal" WHERE "id"=${found.id} FOR UPDATE`;
    const w = await tx.withdrawal.findUniqueOrThrow({
      where: { id: found.id },
    });
    const reject = async (reason: string) => {
      await tx.withdrawal.update({
        where: { id: w.id },
        data: { reconciliationRequired: true, reason },
      });
      return result('REJECTED', reason);
    };
    if (w.providerPayoutId && w.providerPayoutId !== event.resourceId)
      return reject('payout-id-mismatch');
    if (
      event.type !== 'payout.pending' &&
      (event.amount === null || event.currency === null)
    )
      return reject('missing-payout-money');
    if (
      (event.amount !== null && event.amount !== w.netPaidOut) ||
      (event.currency !== null && event.currency !== w.currency)
    )
      return reject('payout-money-mismatch');
    // Once paid, only an explicit reversal can return funds. Stale pending events never regress it.
    if (
      w.stateEventAt &&
      event.occurredAt < w.stateEventAt &&
      event.type === 'payout.pending'
    )
      return result('IGNORED', 'older-than-stored-state');
    if (event.type === 'payout.pending') {
      if (['SUCCEEDED', 'FAILED', 'REVERSED'].includes(w.status))
        return result('IGNORED', 'already-final');
      await tx.withdrawal.update({
        where: { id: w.id },
        data: {
          status: 'PENDING',
          providerPayoutId: event.resourceId,
          stateEventAt: event.occurredAt,
          reason: 'awaiting-provider-confirmation',
          reconciliationRequired: false,
        },
      });
      return result('PROCESSED', 'withdrawal-pending');
    }
    await tx.withdrawal.update({
      where: { id: w.id },
      data: { providerPayoutId: event.resourceId },
    });
    const state =
      event.type === 'payout.succeeded'
        ? 'SUCCEEDED'
        : event.type === 'payout.reversed'
          ? 'REVERSED'
          : 'FAILED';
    const reason = await this.settlement.apply(
      tx,
      w,
      state,
      event.occurredAt,
      `verified-${event.type}`,
    );
    return result(
      reason === 'withdrawal-state-updated'
        ? 'PROCESSED'
        : reason === 'conflicting-terminal-event'
          ? 'REJECTED'
          : 'IGNORED',
      reason,
    );
  }
}
