import { randomUUID } from 'node:crypto';
import { computeDonationFees, DEFAULT_FEE_CONFIG } from '@openraise/shared';
import { LedgerService } from '../src/ledger/ledger.service.js';
import { donationEntries } from '../src/ledger/ledger.entries.js';
import { withdrawalHold } from '../src/withdrawals/withdrawal.entries.js';
import { WithdrawalSettlement } from '../src/withdrawals/withdrawal-settlement.js';
import {
  createTestApp,
  signUpUser,
  type TestApp,
  type TestUser,
} from './helpers.js';
describe('public ledger-backed money trail', () => {
  let t: TestApp,
    owner: TestUser,
    ledger: LedgerService,
    bankId: string,
    id: string,
    slug: string;
  beforeAll(async () => {
    t = await createTestApp();
    owner = await signUpUser(t, { verified: true });
    ledger = t.app.get(LedgerService);
    const bank = await t.prisma.bankAccount.create({
      data: {
        userId: owner.id,
        bankCode: '001',
        bankName: 'PRIVATE BANK',
        accountNumber: '1234567890',
        accountName: 'PRIVATE ACCOUNT OWNER',
        provider: 'paystack',
        recipientId: 'PRIVATE-RECIPIENT',
        recipientUsable: true,
        nameMatchesProfile: true,
        payoutsAvailableAt: new Date(0),
      },
    });
    bankId = bank.id;
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    const cat = await t.prisma.category.findFirstOrThrow();
    const c = await t.prisma.campaign.create({
      data: {
        slug: `trail-${randomUUID()}`,
        title: 'Public money trail example',
        ownerId: owner.id,
        categoryId: cat.id,
        currency: 'NGN',
        goalAmount: 100000000n,
        status: 'ACTIVE',
      },
    });
    id = c.id;
    slug = c.slug;
  });
  const get = (page = 1) =>
    t.http().get(`/campaigns/${slug}/money-trail?page=${page}`);
  async function give(
    amount = 1000000n,
    cover = false,
    posted = true,
    status: 'SUCCEEDED' | 'PENDING' = 'SUCCEEDED',
  ) {
    const fees = computeDonationFees(amount, DEFAULT_FEE_CONFIG, {
      donorCoversPlatformFee: cover,
    });
    const result = posted
      ? await ledger.post({
          kind: 'DONATION',
          currency: 'NGN',
          idempotencyKey: randomUUID(),
          description: 'Trail test gift',
          entries: donationEntries(id, 'NGN', fees),
        })
      : null;
    return t.prisma.donation.create({
      data: {
        campaignId: id,
        donorEmail: 'PRIVATE-DONOR@example.com',
        donorName: 'PRIVATE DONOR NAME',
        donorMessage: 'PRIVATE MESSAGE',
        provider: 'paystack',
        idempotencyKeyHash: randomUUID(),
        reference: `PRIVATE-REFERENCE-${randomUUID()}`,
        currency: 'NGN',
        ...fees,
        donorCoversPlatformFee: cover,
        checkoutState: 'READY',
        status,
        ledgerTransactionId: result?.transactionId,
      },
    });
  }
  async function reserve(amount = 100000n) {
    const fees = { amount, fee: 5000n, netPaidOut: amount - 5000n };
    const h = await ledger.post({
      kind: 'WITHDRAWAL_HOLD',
      currency: 'NGN',
      idempotencyKey: randomUUID(),
      description: 'Trail test reservation',
      entries: withdrawalHold(id, 'NGN', amount),
    });
    return t.prisma.withdrawal.create({
      data: {
        campaignId: id,
        userId: owner.id,
        bankAccountId: bankId,
        bankName: 'PRIVATE BANK',
        accountName: 'PRIVATE ACCOUNT OWNER',
        accountLast4: '7890',
        recipientId: 'PRIVATE-RECIPIENT',
        provider: 'paystack',
        providerPayoutId: 'PRIVATE-PAYOUT-' + randomUUID(),
        reference: 'PRIVATE-REFERENCE-' + randomUUID(),
        idempotencyKeyHash: randomUUID(),
        currency: 'NGN',
        ...fees,
        status: 'PENDING',
        holdTransactionId: h.transactionId,
      },
    });
  }
  async function settle(
    withdrawalId: string,
    state: 'SUCCEEDED' | 'FAILED' | 'REVERSED',
  ) {
    await t.prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.findUniqueOrThrow({
        where: { id: withdrawalId },
      });
      await t.app
        .get(WithdrawalSettlement)
        .apply(tx, w, state, new Date(), 'test-confirmed-provider-event');
    });
  }
  it('only exposes public campaign states and validates page bounds', async () => {
    for (const status of [
      'ACTIVE',
      'PAUSED',
      'ENDED',
      'DRAFT',
      'PENDING_REVIEW',
      'REJECTED',
    ] as const) {
      await t.prisma.campaign.update({ where: { id }, data: { status } });
      await get().expect(
        ['ACTIVE', 'PAUSED', 'ENDED'].includes(status) ? 200 : 404,
      );
    }
    await t.http().get(`/campaigns/${slug}/money-trail?page=0`).expect(400);
    await t.http().get('/campaigns/missing/money-trail').expect(404);
  });
  it('returns explicit zero totals and empty history before any postings', async () => {
    const r = await get().expect(200);
    for (const key of [
      'raised',
      'platformFeesDeducted',
      'received',
      'walletBalance',
      'reserved',
      'paidOut',
      'withdrawalFeesPaid',
      'returned',
      'otherWalletChanges',
    ])
      expect(r.body[key]).toBe('0');
    expect(r.body.withdrawals.items).toEqual([]);
    expect(r.headers['cache-control']).toBe('no-store');
  });
  it('uses exact money and separates donor-covered platform fees from gift deductions', async () => {
    const amount = 9007199254740993n;
    const a = await give(amount),
      b = await give(1000000n, true);
    await give(1000000n, false, false, 'PENDING');
    const r = await get().expect(200);
    expect(r.body.raised).toBe((a.amount + b.amount).toString());
    expect(r.body.platformFeesDeducted).toBe(a.platformFee.toString());
    expect(r.body.donorCoveredPlatformFees).toBe(b.platformFee.toString());
    expect(r.body.walletBalance).toBe(
      (a.netToCampaign + b.netToCampaign).toString(),
    );
    expect(r.body.otherWalletChanges).toBe('0');
    expect(r.body.donationCount).toBe(2);
  });
  it('requires correct donation postings and keeps unrelated currencies out of campaign totals', async () => {
    await give(1000000n, false, false, 'PENDING');
    const fees = computeDonationFees(1000000n, DEFAULT_FEE_CONFIG);
    const wrong = await ledger.post({
      kind: 'ADJUSTMENT',
      currency: 'NGN',
      idempotencyKey: randomUUID(),
      description: 'Other wallet adjustment',
      entries: donationEntries(id, 'NGN', fees),
    });
    await t.prisma.donation.create({
      data: {
        campaignId: id,
        donorEmail: 'private@example.com',
        idempotencyKeyHash: randomUUID(),
        reference: randomUUID(),
        provider: 'paystack',
        currency: 'NGN',
        ...fees,
        donorCoversPlatformFee: false,
        status: 'SUCCEEDED',
        ledgerTransactionId: wrong.transactionId,
      },
    });
    await ledger.post({
      kind: 'DONATION',
      currency: 'USD',
      idempotencyKey: randomUUID(),
      description: 'Different currency',
      entries: donationEntries(id, 'USD', fees),
    });
    const r = await get().expect(200);
    expect(r.body.raised).toBe('0');
    expect(r.body.donationCount).toBe(0);
    expect(r.body.walletBalance).toBe(fees.netToCampaign.toString());
    expect(r.body.otherWalletChanges).toBe(fees.netToCampaign.toString());
  });
  it('distinguishes pending reservations, paid transfers and reversals without double-counting fees', async () => {
    const d = await give(10000000n);
    const paid = await reserve(100000n),
      held = await reserve(200000n),
      failed = await reserve(300000n),
      reversed = await reserve(400000n);
    await settle(paid.id, 'SUCCEEDED');
    await settle(failed.id, 'FAILED');
    await settle(reversed.id, 'SUCCEEDED');
    await settle(reversed.id, 'REVERSED');
    const r = await get().expect(200);
    expect(r.body.reserved).toBe(held.amount.toString());
    expect(r.body.paidOut).toBe(paid.netPaidOut.toString());
    expect(r.body.withdrawalFeesPaid).toBe(paid.fee.toString());
    expect(r.body.returned).toBe((failed.amount + reversed.amount).toString());
    expect(r.body.walletBalance).toBe(
      (d.netToCampaign - paid.amount - held.amount).toString(),
    );
    expect(r.body.otherWalletChanges).toBe('0');
    const states = Object.fromEntries(
      r.body.withdrawals.items.map((w: any) => [w.id, w.state]),
    );
    expect(states).toMatchObject({
      [paid.id]: 'PAID',
      [held.id]: 'IN_PROGRESS',
      [failed.id]: 'RETURNED',
      [reversed.id]: 'RETURNED',
    });
  });
  it('never claims a paid outcome from a misleading settlement link', async () => {
    const gift = await give();
    const w = await reserve();
    await t.prisma.withdrawal.update({
      where: { id: w.id },
      data: {
        status: 'SUCCEEDED',
        settlementTransactionId: gift.ledgerTransactionId,
      },
    });
    const r = await get().expect(200);
    expect(r.body.paidOut).toBe('0');
    expect(r.body.reserved).toBe(w.amount.toString());
    expect(r.body.withdrawals.items[0].state).toBe('IN_PROGRESS');
  });
  it('paginates private-safe withdrawal records and does not alter state on reads', async () => {
    await give(10000000n);
    for (let i = 0; i < 21; i++) await reserve();
    const before = await t.prisma.ledgerEntry.count();
    const r = await get().expect(200);
    expect(r.body.withdrawals.items).toHaveLength(20);
    expect(r.body.withdrawals.hasMore).toBe(true);
    const last = await get(2).expect(200);
    expect(last.body.withdrawals.items).toHaveLength(1);
    expect(last.body.withdrawals.hasMore).toBe(false);
    const raw = JSON.stringify(r.body);
    for (const secret of [
      'PRIVATE BANK',
      'PRIVATE ACCOUNT OWNER',
      '1234567890',
      'PRIVATE-RECIPIENT',
      'PRIVATE-PAYOUT',
      'PRIVATE-REFERENCE',
      'PRIVATE-DONOR',
      'PRIVATE MESSAGE',
      'providerPayoutId',
      'bankAccountId',
      'reconciliationRequired',
      'idempotencyKeyHash',
    ])
      expect(raw).not.toContain(secret);
    expect(await t.prisma.ledgerEntry.count()).toBe(before);
  });
});
