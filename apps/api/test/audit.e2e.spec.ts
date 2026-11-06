import { KycService } from '../src/kyc/kyc.service.js';
import { ReportsService } from '../src/reports/reports.service.js';
import { randomUUID } from 'node:crypto';
import { withAuditActor } from '../src/audit/actor.js';
import { CampaignsService } from '../src/campaigns/campaigns.service.js';
import { WithdrawalsService } from '../src/withdrawals/withdrawals.service.js';
import {
  createTestApp,
  FakePaymentProvider,
  signUpUser,
  type TestApp,
  type TestUser,
} from './helpers.js';
describe('protected append-only audit journal', () => {
  let t: TestApp, admin: TestUser, owner: TestUser;
  const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.accessToken}` });
  beforeAll(async () => {
    const payments = new FakePaymentProvider();
    payments.accounts.set('058:0123456789', 'TEST USER');
    payments.accounts.set('044:0987654321', 'TEST USER');
    t = await createTestApp({ paymentProvider: payments });
    admin = await signUpUser(t, { admin: true, verified: true });
    owner = await signUpUser(t, { verified: true });
  });
  afterAll(async () => {
    await t.app.close();
  });
  const get = (params = '') =>
    t
      .http()
      .get(`/admin/audit${params ? '?' + params : ''}`)
      .set(auth(admin));
  async function campaign() {
    const category = await t.prisma.category.findFirstOrThrow();
    return t.prisma.campaign.create({
      data: {
        title: 'Audit fixture',
        slug: `audit-${randomUUID()}`,
        ownerId: owner.id,
        categoryId: category.id,
        status: 'PENDING_REVIEW',
        currency: 'NGN',
        goalAmount: 1000000n,
      },
    });
  }
  it('requires a current administrator role and validates bounded filters', async () => {
    await t.http().get('/admin/audit').expect(401);
    await t.http().get('/admin/audit').set(auth(owner)).expect(403);
    for (const query of [
      'page=0',
      'page=1001',
      'page=1.5',
      'action=UNKNOWN',
      'from=2026-02-30',
      'from=2026-11-07&to=2026-11-06',
      `q=${'x'.repeat(101)}`,
    ])
      await get(query).expect(400);
    const r = await get().expect(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.items.length).toBeLessThanOrEqual(25);
    const former = await signUpUser(t, { admin: true });
    await t.prisma.user.update({
      where: { id: former.id },
      data: { role: 'USER' },
    });
    await t.http().get('/admin/audit').set(auth(former)).expect(403);
  });
  it('captures review and freeze states with the authenticated actor, excluding notes', async () => {
    const c = await campaign();
    const reviewer = {
      id: admin.id,
      email: admin.email,
      role: 'ADMIN' as const,
      emailVerified: true,
    };
    await t.app
      .get(CampaignsService)
      .decideReview(reviewer, c.id, 'REJECT', 'PRIVATE-REVIEW-NOTE');
    await t.app
      .get(WithdrawalsService)
      .freeze(reviewer, c.id, true, 'PRIVATE-FREEZE-NOTE');
    const r = await get(`q=${c.id}`).expect(200);
    expect(r.body.items).toHaveLength(2);
    expect(r.body.items.every((v: any) => v.actorId === admin.id)).toBe(true);
    expect(
      r.body.items.some(
        (v: any) =>
          v.before.status === 'PENDING_REVIEW' && v.after.status === 'REJECTED',
      ),
    ).toBe(true);
    expect(
      r.body.items.some(
        (v: any) =>
          v.before.payoutsFrozen === false && v.after.payoutsFrozen === true,
      ),
    ).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain('PRIVATE-');
    expect(JSON.stringify(r.body)).not.toContain(owner.email);
  });
  it('bank add/default/removal writes share actor attribution without account data', async () => {
    const add = (bankCode: string, accountNumber: string) =>
      t
        .http()
        .post('/bank-accounts')
        .set(auth(owner))
        .send({ bankCode, accountNumber })
        .expect(201);
    const a = await add('058', '0123456789'),
      b = await add('044', '0987654321');
    await t
      .http()
      .put(`/bank-accounts/${b.body.id}/default`)
      .set(auth(owner))
      .expect(200);
    await t
      .http()
      .delete(`/bank-accounts/${b.body.id}`)
      .set(auth(owner))
      .expect(200);
    const r = await get(`q=${b.body.id}`).expect(200);
    expect(r.body.items).toHaveLength(3);
    expect(r.body.items.every((v: any) => v.actorId === owner.id)).toBe(true);
    expect(
      r.body.items.some(
        (v: any) => v.before?.isDefault === false && v.after.isDefault === true,
      ),
    ).toBe(true);
    expect(r.body.items[0].after.removed).toBe(true);
    const rows = await t.prisma.auditEvent.findMany({
      where: { targetId: { in: [a.body.id, b.body.id] } },
    });
    for (const secret of [
      '0123456789',
      '0987654321',
      'TEST USER',
      'RCP_',
      'GTBank',
    ])
      expect(JSON.stringify(rows)).not.toContain(secret);
  });
  it('identity snapshots retain only state, with atomic actor context', async () => {
    const row = await t.prisma.identityVerification.create({
      data: {
        userId: owner.id,
        provider: 'manual',
        documentType: 'PASSPORT',
        idNumberLast4: '9876',
        legalName: 'PRIVATE-LEGAL-NAME',
        dateOfBirth: new Date('1990-01-01'),
        documentKey: 'PRIVATE-DOCUMENT-KEY',
      },
    });
    // No storage read/delete is needed to test the real decision workflow.
    await t.prisma.identityVerification.update({
      where: { id: row.id },
      data: { documentKey: null },
    });
    await t.app.get(KycService).decide(
      {
        id: admin.id,
        email: admin.email,
        role: 'ADMIN',
        emailVerified: true,
      },
      row.id,
      {
        decision: 'REJECT',
        reason: 'PRIVATE-REASON',
        expectedUpdatedAt: (
          await t.prisma.identityVerification.findUniqueOrThrow({
            where: { id: row.id },
          })
        ).updatedAt.toISOString(),
      },
    );
    const r = await get(`q=${row.id}`).expect(200);
    expect(r.body.items[0]).toMatchObject({
      actorId: admin.id,
      action: 'IDENTITY_DECIDED',
      before: { status: 'PENDING' },
      after: { status: 'REJECTED' },
    });
    expect(JSON.stringify(r.body)).not.toMatch(/PRIVATE-|9876|1990/);
  });
  it('attributes report moderation and report outcomes in the same transaction', async () => {
    const c = await campaign();
    await t.prisma.campaign.update({
      where: { id: c.id },
      data: { status: 'ACTIVE' },
    });
    const report = await t.prisma.campaignReport.create({
      data: {
        campaignId: c.id,
        category: 'MISLEADING',
        details: 'PRIVATE-ALLEGATION with enough detail for review',
        idempotencyKeyHash: randomUUID(),
      },
    });
    const actor = {
      id: admin.id,
      email: admin.email,
      role: 'ADMIN' as const,
      emailVerified: true,
    };
    const run = async (action: 'PAUSE' | 'RESOLVE') => {
      const current = await t.prisma.campaign.findUniqueOrThrow({
        where: { id: c.id },
      });
      const r = await t.prisma.campaignReport.findUniqueOrThrow({
        where: { id: report.id },
      });
      return t.app.get(ReportsService).moderate(actor, report.id, {
        action,
        reason: 'PRIVATE-MODERATION-REASON',
        expectedCampaignUpdatedAt: current.updatedAt.toISOString(),
        expectedReportUpdatedAt: r.updatedAt.toISOString(),
      });
    };
    await run('PAUSE');
    await run('RESOLVE');
    const changed = await t.prisma.auditEvent.findFirstOrThrow({
      where: { targetId: c.id, actorId: admin.id },
    });
    expect(changed.after).toMatchObject({
      status: 'PAUSED',
      moderationPaused: true,
    });
    const r = await get(`q=${report.id}`).expect(200);
    expect(r.body.items[0]).toMatchObject({
      actorId: admin.id,
      before: { status: 'OPEN' },
      after: { status: 'RESOLVED' },
    });
    expect(JSON.stringify(r.body)).not.toContain('PRIVATE-');
  });
  it('rolls back the event with its source change and never leaks actor context', async () => {
    const c = await campaign();
    await expect(
      withAuditActor(t.prisma, admin.id, async (tx) => {
        await tx.campaign.update({
          where: { id: c.id },
          data: { status: 'ACTIVE' },
        });
        throw new Error('rollback fixture');
      }),
    ).rejects.toThrow('rollback fixture');
    expect(await t.prisma.auditEvent.count({ where: { targetId: c.id } })).toBe(
      0,
    );
    expect(
      (await t.prisma.campaign.findUniqueOrThrow({ where: { id: c.id } }))
        .status,
    ).toBe('PENDING_REVIEW');
    await t.prisma.campaign.update({
      where: { id: c.id },
      data: { status: 'ACTIVE' },
    });
    const r = await get(`q=${c.id}`).expect(200);
    expect(r.body.items[0].actorId).toBeNull();
    await t.prisma.campaign.update({
      where: { id: c.id },
      data: { title: 'Unrelated edit' },
    });
    expect(await t.prisma.auditEvent.count({ where: { targetId: c.id } })).toBe(
      1,
    );
  });
  it('rejects UPDATE, DELETE and TRUNCATE, preserving the original event', async () => {
    const row = await t.prisma.auditEvent.findFirstOrThrow();
    await expect(
      t.prisma.auditEvent.update({
        where: { id: row.id },
        data: { action: 'FORGED' },
      }),
    ).rejects.toThrow();
    await expect(
      t.prisma.auditEvent.delete({ where: { id: row.id } }),
    ).rejects.toThrow();
    await expect(t.prisma.$executeRaw`TRUNCATE "AuditEvent"`).rejects.toThrow();
    expect(
      await t.prisma.auditEvent.findUnique({ where: { id: row.id } }),
    ).toEqual(row);
    await t.http().post('/admin/audit').set(auth(admin)).send({}).expect(404);
  });
  it('paginates a stable order, filters exact IDs/action/dates and remains read-only', async () => {
    const subject = randomUUID();
    const when = new Date('2026-01-15T12:00:00Z');
    await t.prisma.auditEvent.createMany({
      data: Array.from({ length: 26 }, (_, n) => ({
        id: `${subject}-${String(n).padStart(2, '0')}`,
        action: 'ROLE_CHANGED',
        targetType: 'User',
        targetId: subject,
        actorId: admin.id,
        createdAt: when,
        before: { role: 'USER' },
        after: { role: 'ADMIN' },
      })),
    });
    const params = `q=${subject}&action=ROLE_CHANGED&from=2026-01-15&to=2026-01-15`;
    const before = await t.prisma.auditEvent.count();
    const a = await get(params).expect(200),
      b = await get(params + '&page=2').expect(200);
    expect(a.body.items).toHaveLength(25);
    expect(a.body.hasMore).toBe(true);
    expect(b.body.items).toHaveLength(1);
    expect(b.body.hasMore).toBe(false);
    expect(
      new Set([...a.body.items, ...b.body.items].map((v) => v.id)).size,
    ).toBe(26);
    expect(
      (await get(`q=${subject.slice(0, 10)}`).expect(200)).body.items,
    ).toHaveLength(0);
    expect(
      (await get(`q=${subject}&action=IDENTITY_DECIDED`).expect(200)).body
        .items,
    ).toHaveLength(0);
    expect(
      (await get(`q=${subject}&from=2026-01-16`).expect(200)).body.items,
    ).toHaveLength(0);
    expect(await t.prisma.auditEvent.count()).toBe(before);
  });
});
