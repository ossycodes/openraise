import { computeDonationFees, DEFAULT_FEE_CONFIG } from '@openraise/shared';
import { randomUUID } from 'node:crypto';
import { donationEntries, UnbalancedTransactionError } from '../src/ledger/ledger.entries.js';
import { LedgerService } from '../src/ledger/ledger.service.js';
import { createTestApp, signUpUser, type TestApp } from './helpers.js';

describe('ledger', () => {
  let t: TestApp;
  let ledger: LedgerService;
  let campaignId: string;

  beforeAll(async () => {
    t = await createTestApp();
    ledger = t.app.get(LedgerService);
    const owner = await signUpUser(t, { verified: true });
    const res = await t
      .http()
      .post('/campaigns')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Ledger test campaign', categorySlug: 'community', goalAmount: '1000000' })
      .expect(201);
    campaignId = res.body.id as string;
  });

  afterAll(async () => {
    await t.app.close();
  });

  const donate = (amount: bigint, key = `donation:${randomUUID()}`, currency: 'NGN' | 'USD' = 'NGN') =>
    ledger.post({
      kind: 'DONATION',
      idempotencyKey: key,
      currency,
      description: 'Test donation',
      entries: donationEntries(campaignId, currency, computeDonationFees(amount, DEFAULT_FEE_CONFIG)),
    });

  it('books a donation: the campaign is owed the net, fees are revenue', async () => {
    const platformBefore = await ledger.balance({ type: 'PLATFORM_REVENUE', currency: 'NGN' });
    const clearingBefore = await ledger.balance({ type: 'PROVIDER_CLEARING', currency: 'NGN' });

    const result = await donate(5_000_000n); // ₦50,000
    expect(result.created).toBe(true);

    expect(await ledger.balance({ type: 'CAMPAIGN_WALLET', currency: 'NGN', campaignId })).toBe(
      4_825_000n,
    );
    expect((await ledger.balance({ type: 'PLATFORM_REVENUE', currency: 'NGN' })) - platformBefore).toBe(
      175_000n,
    );
    expect((await ledger.balance({ type: 'PROVIDER_CLEARING', currency: 'NGN' })) - clearingBefore).toBe(
      5_085_000n,
    );
  });

  it('posts each event once, however often it is replayed', async () => {
    const key = `donation:${randomUUID()}`;
    const before = await ledger.balance({ type: 'CAMPAIGN_WALLET', currency: 'NGN', campaignId });

    const first = await donate(100_000n, key);
    const again = await donate(100_000n, key);
    expect(again).toEqual({ transactionId: first.transactionId, created: false });

    const after = await ledger.balance({ type: 'CAMPAIGN_WALLET', currency: 'NGN', campaignId });
    expect(after - before).toBe(computeDonationFees(100_000n, DEFAULT_FEE_CONFIG).netToCampaign);
  });

  it('posts once even when the same event arrives concurrently', async () => {
    const key = `donation:${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 6 }, () => donate(200_000n, key)));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.transactionId)).size).toBe(1);
    expect(await t.prisma.ledgerTransaction.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('keeps each currency in its own wallet', async () => {
    await donate(10_000n, undefined, 'USD'); // $100
    const balances = await ledger.campaignBalances(campaignId);
    const usd = balances.find((b) => b.currency === 'USD');
    expect(usd?.balance).toBe(computeDonationFees(10_000n, DEFAULT_FEE_CONFIG).netToCampaign);
    expect(balances.map((b) => b.currency)).toEqual(['NGN', 'USD']);
  });

  it('refuses unbalanced postings and writes nothing', async () => {
    const key = `adjustment:${randomUUID()}`;
    await expect(
      ledger.post({
        kind: 'ADJUSTMENT',
        idempotencyKey: key,
        currency: 'NGN',
        description: 'Money from nowhere',
        entries: [
          { account: { type: 'CAMPAIGN_WALLET', currency: 'NGN', campaignId }, amount: -1_000n },
          { account: { type: 'PROVIDER_CLEARING', currency: 'NGN' }, amount: 999n },
        ],
      }),
    ).rejects.toThrow(UnbalancedTransactionError);
    expect(await t.prisma.ledgerTransaction.count({ where: { idempotencyKey: key } })).toBe(0);
  });

  it('passes the integrity check: every transaction and every currency sums to zero', async () => {
    const report = await ledger.integrity();
    expect(report.unbalancedTransactionIds).toEqual([]);
    for (const total of Object.values(report.totalsByCurrency)) expect(total).toBe(0n);
    expect(report.ok).toBe(true);
  });

  it('reports zero for accounts that have never been used', async () => {
    expect(
      await ledger.balance({ type: 'CAMPAIGN_WALLET', currency: 'KES', campaignId }),
    ).toBe(0n);
  });
});
