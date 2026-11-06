import { randomUUID } from 'node:crypto';
import { computeDonationFees, DEFAULT_FEE_CONFIG } from '@openraise/shared';
import { LedgerService } from '../src/ledger/ledger.service.js';
import { donationEntries } from '../src/ledger/ledger.entries.js';
import {
  createTestApp,
  signUpUser,
  type TestApp,
  type TestUser,
} from './helpers.js';
describe('read-only admin money workspace', () => {
  let t: TestApp,
    admin: TestUser,
    owner: TestUser,
    ledger: LedgerService,
    campaignId: string,
    slug: string;
  const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.accessToken}` });
  beforeAll(async () => {
    t = await createTestApp();
    admin = await signUpUser(t, { admin: true });
    owner = await signUpUser(t, { verified: true });
    ledger = t.app.get(LedgerService);
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    const cat = await t.prisma.category.findFirstOrThrow();
    const c = await t.prisma.campaign.create({
      data: {
        slug: `money-${randomUUID()}`,
        title: `Money review ${randomUUID()}`,
        ownerId: owner.id,
        categoryId: cat.id,
        status: 'ACTIVE',
        goalAmount: 10000000n,
        currency: 'NGN',
      },
    });
    campaignId = c.id;
    slug = c.slug;
  });
  const get = (path: string) =>
    t.http().get(`/admin/money${path}`).set(auth(admin));
  const post = (amount = 1000000n, currency: 'NGN' | 'USD' = 'NGN') =>
    ledger.post({
      kind: 'DONATION',
      idempotencyKey: `money-test-${randomUUID()}`,
      currency,
      description: `Donation to ${slug}`,
      entries: donationEntries(
        campaignId,
        currency,
        computeDonationFees(amount, DEFAULT_FEE_CONFIG),
      ),
    });
  async function donation(patch: Record<string, unknown> = {}) {
    const fees = computeDonationFees(1000000n, DEFAULT_FEE_CONFIG);
    return t.prisma.donation.create({
      data: {
        campaignId,
        donorEmail: 'PRIVATE-DONOR@example.com',
        donorName: 'PRIVATE DONOR NAME',
        donorMessage: 'PRIVATE MESSAGE',
        idempotencyKeyHash: randomUUID(),
        reference: `don-${randomUUID()}`,
        provider: 'paystack',
        ...fees,
        currency: 'NGN',
        donorCoversPlatformFee: false,
        checkoutState: 'UNCERTAIN',
        status: 'PENDING',
        ...patch,
      } as any,
    });
  }
  async function withdrawal(patch: Record<string, unknown> = {}) {
    const b = await t.prisma.bankAccount.create({
      data: {
        userId: owner.id,
        bankCode: '001',
        bankName: 'Test Bank',
        accountNumber: '1234567890',
        accountName: 'PRIVATE ACCOUNT NAME',
        provider: 'paystack',
        recipientId: 'PRIVATE-RECIPIENT',
        recipientUsable: true,
        nameMatchesProfile: true,
        payoutsAvailableAt: new Date(0),
      },
    });
    const hold = await ledger.post({
      kind: 'WITHDRAWAL_HOLD',
      idempotencyKey: randomUUID(),
      currency: 'NGN',
      description: 'Test payout reservation',
      entries: [
        {
          account: { type: 'CAMPAIGN_WALLET', currency: 'NGN', campaignId },
          amount: 50000n,
        },
        {
          account: { type: 'PENDING_PAYOUTS', currency: 'NGN' },
          amount: -50000n,
        },
      ],
    });
    return t.prisma.withdrawal.create({
      data: {
        campaignId,
        userId: owner.id,
        bankAccountId: b.id,
        bankName: b.bankName,
        accountName: b.accountName,
        accountLast4: '7890',
        recipientId: b.recipientId,
        provider: 'paystack',
        reference: `wd-${randomUUID()}`,
        idempotencyKeyHash: randomUUID(),
        currency: 'NGN',
        amount: 50000n,
        fee: 5000n,
        netPaidOut: 45000n,
        status: 'UNCERTAIN',
        holdTransactionId: hold.transactionId,
        ...patch,
      } as any,
    });
  }
  it('requires the current admin role for every read and exposes no mutation route', async () => {
    for (const path of [
      '/summary',
      '/ledger',
      '/ledger/missing',
      '/reconciliation',
      '/reconciliation/DONATION/missing',
    ]) {
      await t.http().get(`/admin/money${path}`).expect(401);
      await t.http().get(`/admin/money${path}`).set(auth(owner)).expect(403);
    }
    const revoked = await signUpUser(t, { admin: true });
    await t.prisma.user.update({
      where: { id: revoked.id },
      data: { role: 'USER' },
    });
    await t.http().get('/admin/money/summary').set(auth(revoked)).expect(403);
    await t
      .http()
      .post('/admin/money/ledger')
      .set(auth(admin))
      .send({})
      .expect(404);
  });
  it('keeps exact balances beyond Number precision and never mixes currencies', async () => {
    const before = (await get('/summary').expect(200)).body;
    const amount = 9007199254740993n;
    const fees = computeDonationFees(amount, DEFAULT_FEE_CONFIG);
    await post(amount);
    await post(123456n, 'USD');
    const r = await get('/summary').expect(200);
    const balance = (data: any, type: string, currency: string) =>
      BigInt(
        data.balances.find(
          (b: any) => b.type === type && b.currency === currency,
        )?.balance ?? '0',
      );
    expect(
      balance(r.body, 'CAMPAIGN_WALLET', 'NGN') -
        balance(before, 'CAMPAIGN_WALLET', 'NGN'),
    ).toBe(fees.netToCampaign);
    expect(
      balance(r.body, 'PROVIDER_CLEARING', 'NGN') -
        balance(before, 'PROVIDER_CLEARING', 'NGN'),
    ).toBe(fees.totalCharged);
    expect(r.body.balances.some((b: any) => b.currency === 'USD')).toBe(true);
    expect(r.body.unbalancedCount).toBe(0);
    expect(r.headers['cache-control']).toBe('no-store');
  });
  it('filters ledger postings by campaign, kind, currency and linked references', async () => {
    const p = await post(),
      d = await donation({
        status: 'SUCCEEDED',
        checkoutState: 'READY',
        ledgerTransactionId: p.transactionId,
      });
    await post(100000n, 'USD');
    const r = await get(
      `/ledger?campaignId=${campaignId}&currency=NGN&kind=DONATION&q=${d.reference}`,
    ).expect(200);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.campaignWallet.campaign.id).toBe(campaignId);
    expect(
      BigInt(
        r.body.campaignWallet.balances.find((b: any) => b.currency === 'NGN')
          .balance,
      ),
    ).toBe(computeDonationFees(1000000n, DEFAULT_FEE_CONFIG).netToCampaign);
    expect(r.body.items[0].id).toBe(p.transactionId);
    const detail = await get(`/ledger/${p.transactionId}`).expect(200);
    expect(detail.body.balanced).toBe(true);
    expect(detail.body.sum).toBe('0');
    expect(detail.body.donation.reference).toBe(d.reference);
    expect(
      detail.body.entries.every((e: any) => typeof e.amount === 'string'),
    ).toBe(true);
    expect(JSON.stringify(detail.body)).not.toContain('PRIVATE-DONOR');
    expect(detail.body).not.toHaveProperty('idempotencyKey');
  });
  it('classifies uncertain and stale checkouts without treating ordinary abandonment as reconciliation', async () => {
    const uncertain = await donation(),
      stale = await donation({
        checkoutState: 'INITIALIZING',
        createdAt: new Date(Date.now() - 120000),
      });
    await donation({ checkoutState: 'READY', createdAt: new Date(0) });
    await donation({ checkoutState: 'INITIALIZING' });
    const r = await get(
      `/reconciliation?kind=DONATION&campaignId=${campaignId}`,
    ).expect(200);
    expect(r.body.items.map((i: any) => i.id).sort()).toEqual(
      [uncertain.id, stale.id].sort(),
    );
    const detail = await get(`/reconciliation/DONATION/${uncertain.id}`).expect(
      200,
    );
    expect(detail.body.totalCharged).toBe(uncertain.totalCharged.toString());
    for (const forbidden of [
      'PRIVATE-DONOR',
      'PRIVATE DONOR NAME',
      'PRIVATE MESSAGE',
      'idempotencyKeyHash',
      'checkoutUrl',
    ])
      expect(JSON.stringify(detail.body)).not.toContain(forbidden);
  });
  it('inspects withdrawal holds and freeze history without exposing destinations or altering money', async () => {
    await post();
    const w = await withdrawal();
    await t.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        payoutsFrozen: true,
        payoutFreezeReason: 'Operator investigation',
      },
    });
    await t.prisma.payoutFreezeEvent.create({
      data: {
        campaignId,
        actorId: admin.id,
        frozen: true,
        reason: 'Operator investigation',
      },
    });
    const before = {
      entries: await t.prisma.ledgerEntry.count(),
      transactions: await t.prisma.ledgerTransaction.count(),
      state: (
        await t.prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } })
      ).status,
    };
    const queue = await get(
      `/reconciliation?kind=WITHDRAWAL&campaignId=${campaignId}`,
    ).expect(200);
    expect(queue.body.items.map((r: any) => r.id)).toContain(w.id);
    const d = await get(`/reconciliation/WITHDRAWAL/${w.id}`).expect(200);
    expect(d.body.maskedAccountNumber).toBe('•••• 7890');
    expect(d.body.payoutsFrozen).toBe(true);
    expect(d.body.freezes).toHaveLength(1);
    expect(d.body.ledgerLinks[0].id).toBe(w.holdTransactionId);
    for (const marker of [
      '1234567890',
      'PRIVATE ACCOUNT NAME',
      'PRIVATE-RECIPIENT',
      'idempotencyKeyHash',
    ])
      expect(JSON.stringify(d.body)).not.toContain(marker);
    await get(`/ledger/${w.holdTransactionId}`).expect(200);
    expect(await t.prisma.ledgerEntry.count()).toBe(before.entries);
    expect(await t.prisma.ledgerTransaction.count()).toBe(before.transactions);
    expect(
      (await t.prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } }))
        .status,
    ).toBe(before.state);
  });
  it('shows rejected and stalled events, excludes fresh/ordinary processed events, and omits raw payloads', async () => {
    const d = await donation();
    const event = await t.prisma.paymentEvent.create({
      data: {
        provider: 'paystack',
        eventId: randomUUID(),
        reference: d.reference,
        type: 'payment.succeeded',
        amount: 1000000n,
        currency: 'NGN',
        occurredAt: new Date(),
        processedAt: new Date(),
        outcome: 'REJECTED',
        reason: 'amount-or-currency-mismatch',
        rawBody: Buffer.from('PRIVATE RAW WEBHOOK EMAIL AND TOKEN'),
      },
    });
    const tag = randomUUID();
    await t.prisma.paymentEvent.createMany({
      data: [
        {
          provider: 'paystack',
          eventId: tag + '-old',
          rawBody: Buffer.from('x'),
          occurredAt: new Date(),
          receivedAt: new Date(Date.now() - 120000),
        },
        {
          provider: 'paystack',
          eventId: tag + '-fresh',
          rawBody: Buffer.from('x'),
          occurredAt: new Date(),
        },
        {
          provider: 'paystack',
          eventId: tag + '-done',
          rawBody: Buffer.from('x'),
          occurredAt: new Date(),
          processedAt: new Date(),
          outcome: 'PROCESSED',
        },
      ],
    });
    const r = await get(`/reconciliation?kind=EVENT&q=${tag}`).expect(200);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0].reference).toBe(tag + '-old');
    const e = await get(`/reconciliation/EVENT/${event.id}`).expect(200);
    expect(e.body.relatedRecords[0].id).toBe(d.id);
    expect(e.body).not.toHaveProperty('rawBody');
    expect(JSON.stringify(e.body)).not.toContain('PRIVATE RAW');
  });
  it('flags an incomplete posting rather than presenting an empty zero sum as balanced', async () => {
    const broken = await t.prisma.ledgerTransaction.create({
      data: {
        kind: 'ADJUSTMENT',
        idempotencyKey: randomUUID(),
        currency: 'NGN',
        description: 'Incomplete test fixture',
      },
    });
    try {
      const detail = await get(`/ledger/${broken.id}`).expect(200);
      expect(detail.body.balanced).toBe(false);
      expect(detail.body.entries).toEqual([]);
      const summary = await get('/summary').expect(200);
      expect(summary.body.unbalancedCount).toBeGreaterThan(0);
    } finally {
      await t.prisma.ledgerTransaction.delete({ where: { id: broken.id } });
    }
  });
  it('paginates posting history and validates filters and missing records', async () => {
    for (let i = 0; i < 21; i++) await post(10000n);
    const first = await get(`/ledger?campaignId=${campaignId}`).expect(200);
    expect(first.body.items).toHaveLength(20);
    expect(first.body.total).toBe(21);
    const next = await get(`/ledger?campaignId=${campaignId}&page=2`).expect(
      200,
    );
    expect(next.body.items).toHaveLength(1);
    await get('/ledger?currency=XYZ').expect(400);
    await get('/ledger?page=0').expect(400);
    await get(`/reconciliation?kind=EVENT&campaignId=${campaignId}`).expect(
      400,
    );
    await get('/reconciliation/INVALID/missing').expect(400);
    await get('/ledger/missing').expect(404);
    await get('/reconciliation/DONATION/missing').expect(404);
  });
});
