import type { Currency, DonationFees } from '@openraise/shared';
import type { LedgerAccountType } from '../generated/prisma/client.js';

/**
 * Pure bookkeeping rules: account identity, sign conventions and the entries
 * each business event produces. No database here, so it's easy to test.
 *
 * Signs: an entry's amount is positive for a debit and negative for a
 * credit. Every transaction's entries sum to zero. An account's balance is
 * the sum of its entries, flipped for accounts whose normal balance is a
 * credit (liabilities and revenue), so balances read as positive numbers.
 */

export interface AccountRef {
  type: LedgerAccountType;
  currency: Currency;
  /** Required for CAMPAIGN_WALLET, forbidden for every other type */
  campaignId?: string;
}

export interface EntryInput {
  account: AccountRef;
  /** Signed minor units: + debit, − credit */
  amount: bigint;
}

/** Accounts whose balance grows with debits. Everything else grows with credits. */
const DEBIT_NORMAL: readonly LedgerAccountType[] = ['PROVIDER_CLEARING'];

export function normalSign(type: LedgerAccountType): 1n | -1n {
  return DEBIT_NORMAL.includes(type) ? 1n : -1n;
}

export function accountKey(ref: AccountRef): string {
  if (ref.type === 'CAMPAIGN_WALLET') {
    if (!ref.campaignId) throw new Error('A campaign wallet needs a campaignId');
    return `${ref.type}:${ref.currency}:${ref.campaignId}`;
  }
  if (ref.campaignId) throw new Error(`${ref.type} is not per campaign`);
  return `${ref.type}:${ref.currency}`;
}

export class UnbalancedTransactionError extends Error {}

/** Throws unless the entries form a valid, balanced, single-currency posting. */
export function validateEntries(currency: Currency, entries: EntryInput[]): void {
  if (entries.length < 2) {
    throw new UnbalancedTransactionError('A transaction needs at least two entries');
  }
  let sum = 0n;
  for (const e of entries) {
    if (e.amount === 0n) throw new UnbalancedTransactionError('Entries must not be zero');
    if (e.account.currency !== currency) {
      throw new UnbalancedTransactionError(
        `Entry in ${e.account.currency} in a ${currency} transaction`,
      );
    }
    accountKey(e.account); // validates the campaignId rule
    sum += e.amount;
  }
  if (sum !== 0n) {
    throw new UnbalancedTransactionError(`Entries sum to ${sum}, not zero`);
  }
}

/**
 * A successful donation. The provider holds everything the donor paid; the
 * campaign is owed the net amount; the platform fee and the donor's
 * processing fee are revenue.
 *
 *   PROVIDER_CLEARING  +totalCharged
 *   CAMPAIGN_WALLET    −netToCampaign
 *   PLATFORM_REVENUE   −platformFee   (omitted when zero)
 *   DONOR_FEES         −donorFee      (omitted when zero)
 */
export function donationEntries(
  campaignId: string,
  currency: Currency,
  fees: DonationFees,
): EntryInput[] {
  const entries: EntryInput[] = [
    { account: { type: 'PROVIDER_CLEARING', currency }, amount: fees.totalCharged },
    { account: { type: 'CAMPAIGN_WALLET', currency, campaignId }, amount: -fees.netToCampaign },
  ];
  if (fees.platformFee > 0n) {
    entries.push({ account: { type: 'PLATFORM_REVENUE', currency }, amount: -fees.platformFee });
  }
  if (fees.donorFee > 0n) {
    entries.push({ account: { type: 'DONOR_FEES', currency }, amount: -fees.donorFee });
  }
  return entries;
}
