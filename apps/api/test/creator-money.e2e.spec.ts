import { computeDonationFees, DEFAULT_FEE_CONFIG } from '@openraise/shared';
import { randomUUID } from 'node:crypto';
import { donationEntries } from '../src/ledger/ledger.entries.js';
import { LedgerService } from '../src/ledger/ledger.service.js';
import { withdrawalHold } from '../src/withdrawals/withdrawal.entries.js';
import { createTestApp, signUpUser, type TestApp, type TestUser } from './helpers.js';

describe('creator money', () => {
  let t: TestApp;
  let ledger: LedgerService;
  let owner: TestUser;
  let other: TestUser;
  let campaignId: string;

  beforeAll(async () => {
    t = await createTestApp();
    ledger = t.app.get(LedgerService);
    owner = await signUpUser(t, { verified: true });
    other = await signUpUser(t, { verified: true });
    const category = await t.prisma.category.findFirstOrThrow();
    campaignId = (
      await t.prisma.campaign.create({
        data: {
          slug: `money-${randomUUID()}`,
          title: 'Money campaign',
          ownerId: owner.id,
          categoryId: category.id,
          status: 'ACTIVE',
          currency: 'NGN',
          goalAmount: 100_000_000n,
        },
      })
    ).id;
    // Two confirmed donations, one still pending (never counted).
    await donate(5_000_000n, new Date('2026-11-01T10:00:00Z'));
    await donate(1_000_050n, new Date('2026-11-02T10:00:00Z'));
    await t.prisma.donation.create({ data: donationRow(200_000n, 'PENDING') });
    // One withdrawal in flight: its amount is held out of the wallet.
    const hold = await ledger.post({
      kind: 'WITHDRAWAL_HOLD',
      idempotencyKey: `hold:${randomUUID()}`,
      currency: 'NGN',
      description: 'Test hold',
      entries: withdrawalHold(campaignId, 'NGN', 1_000_000n),
    });
    const bank = await t.prisma.bankAccount.create({
      data: {
        userId: owner.id,
        bankCode: '058',
        bankName: 'Test Bank',
        accountNumber: '0123456789',
        accountName: 'Test User',
        provider: 'paystack',
        recipientId: `RCP_${randomUUID()}`,
        recipientUsable: true,
        nameMatchesProfile: true,
        payoutsAvailableAt: new Date(),
      },
    });
    await t.prisma.withdrawal.create({
      data: {
        campaignId,
        userId: owner.id,
        bankAccountId: bank.id,
        bankName: 'Test Bank',
        accountName: 'Test User',
        accountLast4: '6789',
        recipientId: bank.recipientId!,
        provider: 'paystack',
        reference: `wd-${randomUUID()}`,
        idempotencyKeyHash: randomUUID(),
        currency: 'NGN',
        amount: 1_000_000n,
        fee: 5_000n,
        netPaidOut: 995_000n,
        status: 'PENDING',
        holdTransactionId: hold.transactionId,
      },
    });
  });

  afterAll(async () => {
    await t.app.close();
  });

  function donationRow(amount: bigint, status: 'SUCCEEDED' | 'PENDING') {
    const fees = computeDonationFees(amount, DEFAULT_FEE_CONFIG);
    return {
      campaignId,
      donorEmail: `donor-${randomUUID()}@example.com`,
      idempotencyKeyHash: randomUUID(),
      reference: `don-${randomUUID()}`,
      provider: 'paystack',
      status,
      amount: fees.amount,
      currency: 'NGN',
      platformFee: fees.platformFee,
      donorFee: fees.donorFee,
      totalCharged: fees.totalCharged,
      netToCampaign: fees.netToCampaign,
      donorCoversPlatformFee: false,
    };
  }

  async function donate(amount: bigint, at: Date) {
    const posted = await ledger.post({
      kind: 'DONATION',
      idempotencyKey: `donation:${randomUUID()}`,
      currency: 'NGN',
      description: 'Test donation',
      entries: donationEntries(
        campaignId,
        'NGN',
        computeDonationFees(amount, DEFAULT_FEE_CONFIG),
      ),
    });
    await t.prisma.donation.create({
      data: {
        ...donationRow(amount, 'SUCCEEDED'),
        succeededAt: at,
        ledgerTransactionId: posted.transactionId,
      },
    });
  }

  const get = (path: string, user = owner) =>
    t.http().get(`/campaigns/${campaignId}${path}`).set('Authorization', `Bearer ${user.accessToken}`);

  it('sums confirmed donations, the wallet and withdrawals for the owner', async () => {
    const a = computeDonationFees(5_000_000n, DEFAULT_FEE_CONFIG);
    const b = computeDonationFees(1_000_050n, DEFAULT_FEE_CONFIG);
    const res = await get('/money').expect(200);
    expect(res.body).toMatchObject({
      currency: 'NGN',
      donationCount: 2,
      raised: (a.amount + b.amount).toString(),
      platformFees: (a.platformFee + b.platformFee).toString(),
      received: (a.netToCampaign + b.netToCampaign).toString(),
      // The held withdrawal has left the wallet already.
      available: (a.netToCampaign + b.netToCampaign - 1_000_000n).toString(),
      withdrawalsInProgress: '1000000',
      paidOut: '0',
      payoutsFrozen: false,
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('lists confirmed donations newest first, without donor identities', async () => {
    const res = await get('/donations/received').expect(200);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.items.map((d: { amount: string }) => d.amount)).toEqual(['1000050', '5000000']);
    expect(JSON.stringify(res.body)).not.toMatch(/@example\.com|donorEmail|reference/);
  });

  it('exports every confirmed donation as CSV in major units', async () => {
    const res = await get('/donations/received.csv').expect(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toContain('attachment');
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toBe(
      'confirmed_at,donation_id,currency,amount,platform_fee,donor_fee,net_to_campaign',
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^2026-11-01T10:00:00\.000Z,[a-z0-9]+,NGN,50000\.00,/);
    expect(lines[2]).toContain(',NGN,10000.50,');
    expect(res.text).not.toContain('@example.com');
  });

  it('is private to the owner', async () => {
    await get('/money', other).expect(404);
    await get('/donations/received', other).expect(404);
    await get('/donations/received.csv', other).expect(404);
    await t.http().get(`/campaigns/${campaignId}/money`).expect(401);
  });

  it('rejects a bad page number', async () => {
    await get('/donations/received?page=0').expect(400);
  });
});
