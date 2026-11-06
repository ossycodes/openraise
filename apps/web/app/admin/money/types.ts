import { formatMoney, isCurrency } from '@openraise/shared';
export const ACCOUNT_LABEL: Record<string, string> = {
  PROVIDER_CLEARING: 'Provider clearing',
  CAMPAIGN_WALLET: 'Campaign wallets',
  PENDING_PAYOUTS: 'Pending payouts',
  PLATFORM_REVENUE: 'Platform revenue',
  DONOR_FEES: 'Donor processing fees',
};
export const KIND_LABEL: Record<string, string> = {
  DONATION: 'Donation',
  WITHDRAWAL_HOLD: 'Withdrawal reservation',
  WITHDRAWAL_SETTLE: 'Withdrawal settlement',
  WITHDRAWAL_REVERSE: 'Withdrawal reversal',
  REFUND: 'Refund',
  ADJUSTMENT: 'Adjustment',
};
export const money = (
  amount: string | null | undefined,
  currency: string | null | undefined,
) =>
  amount == null
    ? 'Not provided'
    : isCurrency(currency)
      ? formatMoney(BigInt(amount), currency)
      : `${amount} minor units (${currency ?? 'unknown currency'})`;
export const date = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Africa/Lagos',
      }).format(new Date(value))
    : 'Not recorded';
export interface Summary {
  asOf: string;
  transactionCount: number;
  unbalancedCount: number;
  balances: { currency: string; type: string; balance: string }[];
  review: { withdrawals: number; donations: number; events: number };
}
export interface LedgerRow {
  id: string;
  kind: string;
  currency: string;
  description: string;
  createdAt: string;
  entryCount: number;
  debits: string;
  credits: string;
}
export interface LedgerPage {
  campaignWallet?: {
    campaign: { id: string; title: string };
    balances: { currency: string; balance: string }[];
  } | null;
  items: LedgerRow[];
  total: number;
  page: number;
  limit: number;
}
export interface Transaction {
  id: string;
  kind: string;
  currency: string;
  description: string;
  createdAt: string;
  balanced: boolean;
  sum: string;
  entries: {
    id: string;
    amount: string;
    account: {
      id: string;
      type: string;
      currency: string;
      campaign: { id: string; title: string; slug: string } | null;
    };
  }[];
  donation: { id: string; reference: string } | null;
  withdrawalHold: { id: string; reference: string } | null;
  withdrawalSettlement: { id: string; reference: string } | null;
  withdrawalReversal: { id: string; reference: string } | null;
}
export interface QueueRow {
  id: string;
  kind: string;
  reference: string;
  provider: string;
  currency: string | null;
  amount: string | null;
  status: string;
  reason: string;
  createdAt: string;
  campaign: { id: string; title: string; slug: string } | null;
}
export interface QueuePage {
  items: QueueRow[];
  total: number;
  page: number;
  limit: number;
}
export interface RecordDetail {
  kind: string;
  id: string;
  reference?: string | null;
  provider: string;
  currency: string | null;
  amount: string | null;
  createdAt?: string;
  updatedAt?: string;
  receivedAt?: string;
  occurredAt?: string;
  processedAt?: string | null;
  status?: string;
  checkoutState?: string;
  outcome?: string | null;
  reason?: string | null;
  eventId?: string;
  type?: string | null;
  resourceId?: string | null;
  providerCheckoutId?: string | null;
  providerPaymentId?: string | null;
  providerPayoutId?: string | null;
  totalCharged?: string;
  platformFee?: string;
  donorFee?: string;
  netToCampaign?: string;
  fee?: string;
  netPaidOut?: string;
  bankName?: string;
  maskedAccountNumber?: string;
  payoutsFrozen?: boolean;
  reconciliationRequired?: boolean;
  payoutFreezeReason?: string | null;
  campaign?: { id: string; title: string; slug: string };
  ledgerLinks: { id: string; label: string }[];
  relatedRecords?: { id: string; kind: string; reference: string }[];
  freezes?: {
    id: string;
    frozen: boolean;
    reason: string;
    createdAt: string;
    actor: { name: string };
  }[];
}
export const pageNumber = (v: string | undefined) => {
  const n = Number(v ?? 1);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
};
