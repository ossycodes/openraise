import { computeDonationFees, DEFAULT_FEE_CONFIG, type FeeConfig } from '@openraise/shared';
import {
  accountKey,
  donationEntries,
  normalSign,
  UnbalancedTransactionError,
  validateEntries,
  type EntryInput,
} from './ledger.entries.js';

const wallet = { type: 'CAMPAIGN_WALLET' as const, currency: 'NGN' as const, campaignId: 'c1' };
const clearing = { type: 'PROVIDER_CLEARING' as const, currency: 'NGN' as const };

describe('ledger entries', () => {
  it('names accounts, one wallet per campaign and currency', () => {
    expect(accountKey(wallet)).toBe('CAMPAIGN_WALLET:NGN:c1');
    expect(accountKey({ type: 'PLATFORM_REVENUE', currency: 'USD' })).toBe('PLATFORM_REVENUE:USD');
    expect(() => accountKey({ type: 'CAMPAIGN_WALLET', currency: 'NGN' })).toThrow();
    expect(() => accountKey({ ...clearing, campaignId: 'c1' })).toThrow();
  });

  it('reads asset balances as debits and liabilities as credits', () => {
    expect(normalSign('PROVIDER_CLEARING')).toBe(1n);
    expect(normalSign('CAMPAIGN_WALLET')).toBe(-1n);
    expect(normalSign('PLATFORM_REVENUE')).toBe(-1n);
  });

  it('accepts a balanced posting', () => {
    expect(() =>
      validateEntries('NGN', [
        { account: clearing, amount: 500n },
        { account: wallet, amount: -500n },
      ]),
    ).not.toThrow();
  });

  it('refuses unbalanced, one-sided, zero and mixed-currency postings', () => {
    const bad: EntryInput[][] = [
      [
        { account: clearing, amount: 500n },
        { account: wallet, amount: -499n },
      ],
      [{ account: clearing, amount: 500n }],
      [
        { account: clearing, amount: 0n },
        { account: wallet, amount: 0n },
      ],
      [
        { account: clearing, amount: 500n },
        { account: { ...wallet, currency: 'USD' }, amount: -500n },
      ],
    ];
    for (const entries of bad) {
      expect(() => validateEntries('NGN', entries)).toThrow(UnbalancedTransactionError);
    }
  });

  it('books a donation as balanced entries, for every fee setting', () => {
    const free: FeeConfig = { ...DEFAULT_FEE_CONFIG, platformFeeBps: 0, donorFeeBps: 0, donorFlatFee: 0n };
    for (const config of [DEFAULT_FEE_CONFIG, free]) {
      for (const cover of [false, true]) {
        for (const amount of [1n, 250_000n, 5_000_000n]) {
          const fees = computeDonationFees(amount, config, { donorCoversPlatformFee: cover });
          const entries = donationEntries('c1', 'NGN', fees);
          expect(() => validateEntries('NGN', entries)).not.toThrow();
          const toWallet = entries.find((e) => e.account.type === 'CAMPAIGN_WALLET');
          expect(toWallet?.amount).toBe(-fees.netToCampaign);
        }
      }
    }
  });

  it('leaves out zero fee lines', () => {
    const free: FeeConfig = { ...DEFAULT_FEE_CONFIG, platformFeeBps: 0, donorFeeBps: 0, donorFlatFee: 0n };
    const entries = donationEntries('c1', 'NGN', computeDonationFees(100_000n, free));
    expect(entries.map((e) => e.account.type)).toEqual(['PROVIDER_CLEARING', 'CAMPAIGN_WALLET']);
  });
});
