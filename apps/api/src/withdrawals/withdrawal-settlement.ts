import { Injectable } from '@nestjs/common';
import { isCurrency } from '@openraise/shared';
import type { Prisma, Withdrawal } from '../generated/prisma/client.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { withdrawalReverse, withdrawalSettle } from './withdrawal.entries.js';

@Injectable()
export class WithdrawalSettlement {
  constructor(private readonly ledger: LedgerService) {}
  /** Caller locks campaign then withdrawal; financial state and posting commit together. */
  async apply(
    tx: Prisma.TransactionClient,
    withdrawal: Withdrawal,
    state: 'SUCCEEDED' | 'FAILED' | 'REVERSED',
    at: Date,
    reason: string,
  ) {
    const w = withdrawal;
    const terminal = ['SUCCEEDED', 'FAILED', 'REVERSED'].includes(w.status);
    if (
      w.status === state ||
      (w.status === 'FAILED' && state === 'REVERSED') ||
      (w.status === 'REVERSED' && state === 'FAILED')
    )
      return 'already-final';
    // A confirmed reversal can follow success. Other contradictory final events need review.
    if (terminal && !(w.status === 'SUCCEEDED' && state === 'REVERSED')) {
      await tx.withdrawal.update({
        where: { id: w.id },
        data: {
          reconciliationRequired: true,
          reason: 'conflicting-terminal-event',
        },
      });
      return 'conflicting-terminal-event';
    }
    if (!isCurrency(w.currency))
      throw new Error('Invalid persisted withdrawal currency');
    const fees = { amount: w.amount, fee: w.fee, netPaidOut: w.netPaidOut };
    const succeeded = state === 'SUCCEEDED';
    const posting = await this.ledger.postInTransaction(tx, {
      kind: succeeded ? 'WITHDRAWAL_SETTLE' : 'WITHDRAWAL_REVERSE',
      idempotencyKey: `withdrawal:${w.id}:${succeeded ? 'settle' : 'reverse'}`,
      currency: w.currency,
      description: succeeded
        ? 'Confirmed campaign payout'
        : 'Returned campaign withdrawal',
      entries: succeeded
        ? withdrawalSettle(w.currency, fees)
        : withdrawalReverse(
            w.campaignId,
            w.currency,
            fees,
            w.status === 'SUCCEEDED',
          ),
    });
    await tx.withdrawal.update({
      where: { id: w.id },
      data: {
        status: state,
        stateEventAt: at,
        reason,
        reconciliationRequired: false,
        ...(succeeded
          ? { settlementTransactionId: posting.transactionId }
          : { reversalTransactionId: posting.transactionId }),
      },
    });
    return 'withdrawal-state-updated';
  }
}
