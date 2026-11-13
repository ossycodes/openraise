import { randomUUID } from 'node:crypto';
import { PaystackProvider } from '../src/payments/adapters/paystack.js';
import { PaymentProviderError } from '../src/payments/provider-http.js';
import type {
  PayoutInput,
  VerifiedPayout,
} from '../src/payments/payment-provider.js';
import { LedgerService } from '../src/ledger/ledger.service.js';
import { SettingsService } from '../src/settings/settings.service.js';
import { FeesService } from '../src/fees/fees.service.js';
import {
  createTestApp,
  signUpUser,
  type TestApp,
  type TestUser,
} from './helpers.js';

const provider = new PaystackProvider('admin-test-key');
const payout = vi.fn(async (value: PayoutInput) => ({
  id: `TRF_${value.reference}`,
  reference: value.reference,
  status: 'pending' as const,
}));
const verifyPayout = vi.fn<(reference: string) => Promise<VerifiedPayout>>();
provider.createPayout = payout;
provider.verifyPayout = verifyPayout;
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.accessToken}` });
const reason = 'Reviewed provider and account evidence';

describe('admin operations', () => {
  let t: TestApp, admin: TestUser, owner: TestUser;
  let campaignId: string, bankId: string;
  beforeAll(async () => {
    t = await createTestApp({ paymentProvider: provider });
    await t.prisma.deploymentSettings.deleteMany();
    admin = await signUpUser(t, { admin: true, verified: true });
    owner = await signUpUser(t, { verified: true });
  });
  afterAll(async () => {
    await t.prisma.deploymentSettings.deleteMany();
    await t.app.close();
  });
  beforeEach(async () => {
    payout.mockClear();
    verifyPayout.mockReset();
    await t.prisma.deploymentSettings.deleteMany();
    const category = await t.prisma.category.findFirstOrThrow();
    const campaign = await t.prisma.campaign.create({
      data: {
        slug: `ops-${randomUUID()}`,
        title: 'Admin operations campaign',
        status: 'ACTIVE',
        ownerId: owner.id,
        categoryId: category.id,
        goalAmount: 100000000n,
        currency: 'NGN',
      },
    });
    campaignId = campaign.id;
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
        payoutsAvailableAt: new Date(0),
      },
    });
    bankId = bank.id;
    await t.app.get(LedgerService).post({
      kind: 'ADJUSTMENT',
      idempotencyKey: randomUUID(),
      currency: 'NGN',
      description: 'Test campaign funds',
      entries: [
        {
          account: { type: 'PROVIDER_CLEARING', currency: 'NGN' },
          amount: 5000000n,
        },
        {
          account: { type: 'CAMPAIGN_WALLET', currency: 'NGN', campaignId },
          amount: -5000000n,
        },
      ],
    });
  });
  const get = (path: string, user = admin) =>
    t.http().get(path).set(auth(user));
  const post = (path: string, body: object, user = admin) =>
    t.http().post(path).set(auth(user)).send(body);
  async function withdrawal() {
    const response = await post(
      `/campaigns/${campaignId}/withdrawals`,
      { amount: '2000000', expectedFee: '5000', bankAccountId: bankId },
      owner,
    )
      .set('Idempotency-Key', randomUUID())
      .expect(201);
    return t.prisma.withdrawal.findUniqueOrThrow({
      where: { id: response.body.id },
    });
  }
  const moneyAction = async (
    id: string,
    action = 'VERIFY',
    expected?: string,
  ) => {
    const w = await t.prisma.withdrawal.findUniqueOrThrow({ where: { id } });
    return post(`/admin/money/reconciliation/WITHDRAWAL/${id}/actions`, {
      action,
      expectedUpdatedAt: expected ?? w.updatedAt.toISOString(),
      reason,
    });
  };
  const evidence = (
    w: {
      providerPayoutId: string | null;
      reference: string;
      netPaidOut: bigint;
      recipientId: string;
    },
    status: VerifiedPayout['status'],
  ): VerifiedPayout => ({
    id: w.providerPayoutId!,
    reference: w.reference,
    amount: w.netPaidOut,
    currency: 'NGN',
    recipientId: w.recipientId,
    status,
  });

  it('protects every admin read and mutation and never returns credential fields', async () => {
    for (const path of [
      '/admin/users',
      '/admin/categories',
      '/admin/settings',
    ]) {
      await t.http().get(path).expect(401);
      await get(path, owner).expect(403);
    }
    const users = await get(
      `/admin/users?q=${encodeURIComponent(owner.email)}`,
    ).expect(200);
    expect(users.body.items).toHaveLength(1);
    const serialized = JSON.stringify(users.body);
    for (const secret of [
      'passwordHash',
      'googleSubject',
      'tokenVersion',
      'refreshToken',
    ])
      expect(serialized).not.toContain(secret);
    await post('/admin/settings', {}, owner).expect(403);
    expect(
      (await get(`/admin/users/${admin.id}`).expect(200)).body.canManageAccess,
    ).toBe(false);
    expect(
      (await get(`/admin/users/${owner.id}`).expect(200)).body.canManageAccess,
    ).toBe(true);
  });
  it('changes a role, attributes the audit and revokes old access and refresh tokens', async () => {
    const target = await signUpUser(t, { verified: true });
    const row = await t.prisma.user.findUniqueOrThrow({
      where: { id: target.id },
    });
    await post(`/admin/users/${target.id}/actions`, {
      action: 'SET_ROLE',
      role: 'ADMIN',
      expectedUpdatedAt: row.updatedAt.toISOString(),
      reason,
    }).expect(200);
    await get('/users/me', target).expect(401);
    await t
      .http()
      .post('/auth/refresh')
      .send({ refreshToken: target.refreshToken })
      .expect(401);
    const event = await t.prisma.auditEvent.findFirstOrThrow({
      where: { targetId: target.id, action: 'USER_ACCESS_CHANGED' },
    });
    expect(event.actorId).toBe(admin.id);
    expect(event.after).toMatchObject({ role: 'ADMIN', reason });
    const current = await t.prisma.user.findUniqueOrThrow({
      where: { id: admin.id },
    });
    await post(`/admin/users/${admin.id}/actions`, {
      action: 'SET_ROLE',
      role: 'USER',
      expectedUpdatedAt: current.updatedAt.toISOString(),
      reason,
    }).expect(403);
  });
  it('rejects stale user edits and records explicit session revocation', async () => {
    const target = await signUpUser(t);
    await post(`/admin/users/${target.id}/actions`, {
      action: 'REVOKE_SESSIONS',
      expectedUpdatedAt: new Date(0).toISOString(),
      reason,
    }).expect(409);
    const row = await t.prisma.user.findUniqueOrThrow({
      where: { id: target.id },
    });
    await post(`/admin/users/${target.id}/actions`, {
      action: 'REVOKE_SESSIONS',
      expectedUpdatedAt: row.updatedAt.toISOString(),
      reason,
    }).expect(200);
    await get('/users/me', target).expect(401);
  });
  it('serializes simultaneous administrator demotions', async () => {
    const a = await signUpUser(t, { admin: true }),
      b = await signUpUser(t, { admin: true });
    const [ra, rb] = await Promise.all([
      t.prisma.user.findUniqueOrThrow({ where: { id: a.id } }),
      t.prisma.user.findUniqueOrThrow({ where: { id: b.id } }),
    ]);
    const results = await Promise.all([
      post(
        `/admin/users/${b.id}/actions`,
        {
          action: 'SET_ROLE',
          role: 'USER',
          expectedUpdatedAt: rb.updatedAt.toISOString(),
          reason,
        },
        a,
      ),
      post(
        `/admin/users/${a.id}/actions`,
        {
          action: 'SET_ROLE',
          role: 'USER',
          expectedUpdatedAt: ra.updatedAt.toISOString(),
          reason,
        },
        b,
      ),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.every((r) => [200, 401, 403].includes(r.status))).toBe(true);
  });
  it('features, pauses, resumes, freezes and ends a campaign with stale-write protection', async () => {
    const change = async (action: string) => {
      const c = await t.prisma.campaign.findUniqueOrThrow({
        where: { id: campaignId },
      });
      return post(`/admin/campaigns/${campaignId}/actions`, {
        action,
        expectedUpdatedAt: c.updatedAt.toISOString(),
        reason,
      });
    };
    const featured = await change('FEATURE');
    expect(featured.status).toBe(200);
    expect(featured.body.featured).toBe(true);
    const old = featured.body.updatedAt;
    expect((await change('PAUSE')).body.status).toBe('PAUSED');
    await post(`/admin/campaigns/${campaignId}/actions`, {
      action: 'RESUME',
      expectedUpdatedAt: old,
      reason,
    }).expect(409);
    expect((await change('RESUME')).body.status).toBe('ACTIVE');
    expect((await change('FREEZE_PAYOUTS')).body.payoutsFrozen).toBe(true);
    expect((await change('UNFREEZE_PAYOUTS')).body.payoutsFrozen).toBe(false);
    expect((await change('END')).body.status).toBe('ENDED');
    expect((await change('RESUME')).status).toBe(409);
    expect(
      await t.prisma.auditEvent.count({
        where: {
          targetId: campaignId,
          actorId: admin.id,
          action: { startsWith: 'ADMIN_CAMPAIGN_' },
        },
      }),
    ).toBe(6);
  });
  it('audits category edits and rejects stale versions without changing public URLs', async () => {
    const slug = `category-${randomUUID()}`;
    await post('/categories', {
      slug,
      name: 'First category',
      description: '',
      sortOrder: 50,
      reason,
    }).expect(201);
    const row = await t.prisma.category.findUniqueOrThrow({ where: { slug } });
    await t
      .http()
      .patch(`/categories/${slug}`)
      .set(auth(admin))
      .send({
        name: 'Renamed category',
        expectedUpdatedAt: row.updatedAt.toISOString(),
        reason,
      })
      .expect(200);
    await t
      .http()
      .patch(`/categories/${slug}`)
      .set(auth(admin))
      .send({
        name: 'Stale change',
        expectedUpdatedAt: row.updatedAt.toISOString(),
        reason,
      })
      .expect(409);
    expect(
      (await t.http().get(`/categories/${slug}`).expect(200)).body.name,
    ).toBe('Renamed category');
    expect(
      await t.prisma.auditEvent.count({
        where: {
          targetId: row.id,
          actorId: admin.id,
          action: { startsWith: 'CATEGORY_' },
        },
      }),
    ).toBe(2);
  });
  it('applies saved branding and exact prospective fees across service instances', async () => {
    const initial = await get('/admin/settings').expect(200);
    const values = {
      ...initial.body.values,
      name: 'Community <Gives>',
      platformFeeBps: 200,
      withdrawalFee: '7500',
    };
    await post('/admin/settings', {
      values,
      expectedVersion: initial.body.version,
      reason,
    }).expect(200);
    expect((await t.http().get('/config/site').expect(200)).body.name).toBe(
      values.name,
    );
    expect(
      (await t.http().get('/config/fees').expect(200)).body.withdrawalFee,
    ).toBe('7500');
    expect((await t.app.get(FeesService).donation(1000000n)).platformFee).toBe(
      20000n,
    );
    const second = await createTestApp();
    try {
      expect((await second.app.get(SettingsService).get()).values.name).toBe(
        values.name,
      );
    } finally {
      await second.app.close();
    }
    const fresh = await signUpUser(t);
    expect(t.mail.lastTo(fresh.email)?.html).toContain(
      'Community &lt;Gives&gt;',
    );
    await post('/admin/settings', {
      values,
      expectedVersion: initial.body.version,
      reason,
    }).expect(409);
    await post('/admin/settings', {
      values: { ...values, logoUrl: 'javascript:alert(1)' },
      expectedVersion: 1,
      reason,
    }).expect(400);
    expect(
      await t.prisma.auditEvent.count({
        where: { targetType: 'DeploymentSettings', actorId: admin.id },
      }),
    ).toBeGreaterThan(0);
  });
  it('does not alter existing withdrawal fee snapshots after settings change', async () => {
    const w = await withdrawal();
    const initial = await get('/admin/settings').expect(200);
    await post('/admin/settings', {
      values: { ...initial.body.values, withdrawalFee: '7500' },
      expectedVersion: 0,
      reason,
    }).expect(200);
    expect(
      (await t.prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } }))
        .fee,
    ).toBe(5000n);
    await post(
      `/campaigns/${campaignId}/withdrawals`,
      { amount: '2000000', expectedFee: '5000', bankAccountId: bankId },
      owner,
    )
      .set('Idempotency-Key', randomUUID())
      .expect(409);
  });
  it('settles an uncertain payout from matching provider evidence exactly once', async () => {
    const w = await withdrawal();
    await t.prisma.withdrawal.update({
      where: { id: w.id },
      data: { status: 'UNCERTAIN', reconciliationRequired: true },
    });
    verifyPayout.mockResolvedValue(evidence(w, 'succeeded'));
    expect((await moneyAction(w.id)).status).toBe(200);
    expect((await moneyAction(w.id)).status).toBe(200);
    const current = await t.prisma.withdrawal.findUniqueOrThrow({
      where: { id: w.id },
    });
    expect(current.status).toBe('SUCCEEDED');
    expect(current.reconciliationRequired).toBe(false);
    expect(
      await t.prisma.ledgerTransaction.count({
        where: { idempotencyKey: `withdrawal:${w.id}:settle` },
      }),
    ).toBe(1);
    expect(payout).toHaveBeenCalledTimes(1);
  });
  it('refuses wrong destination or amount, unknown outcomes and provider outages', async () => {
    const w = await withdrawal();
    verifyPayout.mockResolvedValue({
      ...evidence(w, 'succeeded'),
      amount: w.netPaidOut + 1n,
    });
    expect((await moneyAction(w.id)).status).toBe(409);
    verifyPayout.mockResolvedValue({
      ...evidence(w, 'succeeded'),
      recipientId: 'another-recipient',
    });
    expect((await moneyAction(w.id)).status).toBe(409);
    verifyPayout.mockResolvedValue(evidence(w, 'unknown'));
    expect((await moneyAction(w.id)).status).toBe(409);
    verifyPayout.mockRejectedValue(new PaymentProviderError('transport-error'));
    expect((await moneyAction(w.id)).status).toBe(503);
    expect(
      (await t.prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } }))
        .status,
    ).toBe('PENDING');
    expect(payout).toHaveBeenCalledTimes(1);
  });
  it('creates only one successor when a confirmed failed payout is retried concurrently', async () => {
    const w = await withdrawal();
    verifyPayout.mockResolvedValue(evidence(w, 'failed'));
    expect((await moneyAction(w.id)).status).toBe(200);
    const version = (
      await t.prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } })
    ).updatedAt.toISOString();
    const results = await Promise.all([
      moneyAction(w.id, 'RETRY', version),
      moneyAction(w.id, 'RETRY', version),
    ]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results[0]!.body.retryId).toBe(results[1]!.body.retryId);
    expect(
      await t.prisma.withdrawal.count({ where: { retryOfId: w.id } }),
    ).toBe(1);
    expect(payout).toHaveBeenCalledTimes(2);
    expect((await moneyAction(w.id, 'RETRY', version)).body.retryId).toBe(
      results[0]!.body.retryId,
    );
    expect(payout).toHaveBeenCalledTimes(2);
  });
  it('blocks retries while pending, when frozen, or when current fees changed', async () => {
    const w = await withdrawal();
    verifyPayout.mockResolvedValue(evidence(w, 'pending'));
    expect((await moneyAction(w.id, 'RETRY')).status).toBe(409);
    verifyPayout.mockResolvedValue(evidence(w, 'failed'));
    expect((await moneyAction(w.id)).status).toBe(200);
    await t.prisma.campaign.update({
      where: { id: campaignId },
      data: { payoutsFrozen: true },
    });
    expect((await moneyAction(w.id, 'RETRY')).status).toBe(403);
    await t.prisma.campaign.update({
      where: { id: campaignId },
      data: { payoutsFrozen: false },
    });
    const initial = await get('/admin/settings').expect(200);
    await post('/admin/settings', {
      values: { ...initial.body.values, withdrawalFee: '7500' },
      expectedVersion: 0,
      reason,
    }).expect(200);
    expect((await moneyAction(w.id, 'RETRY')).status).toBe(409);
    expect(payout).toHaveBeenCalledTimes(1);
  });
  it('reconciles a verified donation without duplicate credits or receipts', async () => {
    const fees = await t.app.get(FeesService).donation(1000000n);
    const d = await t.prisma.donation.create({
      data: {
        campaignId,
        donorEmail: 'test-donor@example.com',
        idempotencyKeyHash: randomUUID(),
        reference: `don_${randomUUID()}`,
        provider: 'paystack',
        currency: 'NGN',
        ...fees,
        status: 'PENDING',
        checkoutState: 'UNCERTAIN',
      },
    });
    provider.verifyPayment = vi.fn(async () => ({
      id: `pay_${d.id}`,
      reference: d.reference,
      amount: d.totalCharged,
      currency: 'NGN' as const,
      status: 'succeeded' as const,
    }));
    const verify = async () => {
      const current = await t.prisma.donation.findUniqueOrThrow({
        where: { id: d.id },
      });
      return post(`/admin/money/reconciliation/DONATION/${d.id}/actions`, {
        action: 'VERIFY',
        expectedUpdatedAt: current.updatedAt.toISOString(),
        reason,
      });
    };
    expect((await verify()).status).toBe(200);
    expect((await verify()).status).toBe(200);
    const settled = await t.prisma.donation.findUniqueOrThrow({
      where: { id: d.id },
    });
    expect(settled.status).toBe('SUCCEEDED');
    expect(settled.ledgerTransactionId).toBeTruthy();
    expect(
      await t.prisma.ledgerTransaction.count({
        where: { idempotencyKey: `donation:${d.id}` },
      }),
    ).toBe(1);
    expect(
      await t.prisma.notificationDelivery.count({
        where: { dedupeKey: `receipt:${d.id}` },
      }),
    ).toBe(1);
  });
  it('rejects mismatched donation evidence without creating a posting', async () => {
    const fees = await t.app.get(FeesService).donation(1000000n);
    const d = await t.prisma.donation.create({
      data: {
        campaignId,
        donorEmail: 'test-donor@example.com',
        idempotencyKeyHash: randomUUID(),
        reference: `don_${randomUUID()}`,
        provider: 'paystack',
        currency: 'NGN',
        ...fees,
      },
    });
    provider.verifyPayment = vi.fn(async () => ({
      id: 'wrong-payment',
      reference: 'wrong-reference',
      amount: d.totalCharged,
      currency: 'NGN' as const,
      status: 'succeeded' as const,
    }));
    await post(`/admin/money/reconciliation/DONATION/${d.id}/actions`, {
      action: 'VERIFY',
      expectedUpdatedAt: d.updatedAt.toISOString(),
      reason,
    }).expect(409);
    expect(
      await t.prisma.ledgerTransaction.count({
        where: { idempotencyKey: `donation:${d.id}` },
      }),
    ).toBe(0);
  });
  it('reprocesses supported stored events and refuses unsupported or already-successful events', async () => {
    const event = await t.prisma.paymentEvent.create({
      data: {
        provider: 'paystack',
        eventId: `test_${randomUUID()}`,
        rawBody: new Uint8Array(),
        type: 'payment.succeeded',
        reference: `unknown_${randomUUID()}`,
        resourceId: 'test-payment',
        amount: 10000n,
        currency: 'NGN',
        occurredAt: new Date(),
        processedAt: new Date(),
        outcome: 'IGNORED',
        reason: 'unknown-donation',
      },
    });
    await post(`/admin/money/reconciliation/EVENT/${event.id}/actions`, {
      action: 'REPROCESS',
      expectedUpdatedAt: event.processedAt!.toISOString(),
      reason,
    }).expect(200);
    expect(
      (
        await t.prisma.paymentEvent.findUniqueOrThrow({
          where: { id: event.id },
        })
      ).processedAt,
    ).toBeTruthy();
    await t.prisma.paymentEvent.update({
      where: { id: event.id },
      data: { outcome: 'PROCESSED' },
    });
    const current = await t.prisma.paymentEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    await post(`/admin/money/reconciliation/EVENT/${event.id}/actions`, {
      action: 'REPROCESS',
      expectedUpdatedAt: current.processedAt!.toISOString(),
      reason,
    }).expect(409);
    expect(
      await t.prisma.auditEvent.count({
        where: {
          targetId: event.id,
          action: 'PAYMENT_EVENT_REPROCESS_REQUESTED',
          actorId: admin.id,
        },
      }),
    ).toBe(1);
  });
  it('rechecks administrator access after a provider lookup finishes', async () => {
    const operator = await signUpUser(t, { admin: true, verified: true });
    const w = await withdrawal();
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    verifyPayout.mockImplementation(async () => {
      entered();
      await gate;
      return evidence(w, 'succeeded');
    });
    const pending = post(
      `/admin/money/reconciliation/WITHDRAWAL/${w.id}/actions`,
      {
        action: 'VERIFY',
        expectedUpdatedAt: w.updatedAt.toISOString(),
        reason,
      },
      operator,
    ).then((r) => r);
    await started;
    try {
      const row = await t.prisma.user.findUniqueOrThrow({
        where: { id: operator.id },
      });
      await post(`/admin/users/${operator.id}/actions`, {
        action: 'SET_ROLE',
        role: 'USER',
        expectedUpdatedAt: row.updatedAt.toISOString(),
        reason,
      }).expect(200);
    } finally {
      release();
    }
    expect((await pending).status).toBe(403);
    expect(
      (await t.prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } }))
        .status,
    ).toBe('PENDING');
    expect(
      await t.prisma.ledgerTransaction.count({
        where: { idempotencyKey: `withdrawal:${w.id}:settle` },
      }),
    ).toBe(0);
  });
});
