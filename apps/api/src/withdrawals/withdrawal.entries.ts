import type { Currency, WithdrawalBreakdown } from '@openraise/shared';
import type { EntryInput } from '../ledger/ledger.entries.js';
export function withdrawalHold(
  campaignId: string,
  currency: Currency,
  amount: bigint,
): EntryInput[] {
  return [
    { account: { type: 'CAMPAIGN_WALLET', currency, campaignId }, amount },
    { account: { type: 'PENDING_PAYOUTS', currency }, amount: -amount },
  ];
}
export function withdrawalSettle(
  currency: Currency,
  fees: WithdrawalBreakdown,
): EntryInput[] {
  return [
    { account: { type: 'PENDING_PAYOUTS', currency }, amount: fees.amount },
    {
      account: { type: 'PROVIDER_CLEARING', currency },
      amount: -fees.netPaidOut,
    },
    ...(fees.fee > 0n
      ? [
          {
            account: { type: 'PLATFORM_REVENUE' as const, currency },
            amount: -fees.fee,
          },
        ]
      : []),
  ];
}
export function withdrawalReverse(
  campaignId: string,
  currency: Currency,
  fees: WithdrawalBreakdown,
  settled: boolean,
): EntryInput[] {
  if (!settled)
    return withdrawalHold(campaignId, currency, fees.amount).map((e) => ({
      ...e,
      amount: -e.amount,
    }));
  return [
    {
      account: { type: 'PROVIDER_CLEARING', currency },
      amount: fees.netPaidOut,
    },
    ...(fees.fee > 0n
      ? [
          {
            account: { type: 'PLATFORM_REVENUE' as const, currency },
            amount: fees.fee,
          },
        ]
      : []),
    {
      account: { type: 'CAMPAIGN_WALLET', currency, campaignId },
      amount: -fees.amount,
    },
  ];
}
