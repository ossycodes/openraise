import { randomUUID } from 'node:crypto';
import { ReportsService } from '../src/reports/reports.service.js';
import {
  createTestApp,
  signUpUser,
  type TestApp,
  type TestUser,
} from './helpers.js';
describe('private campaign reports and moderation', () => {
  let t: TestApp, owner: TestUser, admin: TestUser, other: TestUser;
  let id: string, slug: string;
  const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.accessToken}` });
  const reportBody = {
    category: 'MISLEADING',
    details:
      'Please check the tuition budget: the amounts in the story do not match.',
  };
  beforeAll(async () => {
    t = await createTestApp();
    owner = await signUpUser(t, { verified: true });
    admin = await signUpUser(t, { admin: true, verified: true });
    other = await signUpUser(t, { admin: true, verified: true });
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    const cat = await t.prisma.category.findFirstOrThrow();
    const c = await t.prisma.campaign.create({
      data: {
        slug: `reports-${randomUUID()}`,
        title: `A reported campaign ${randomUUID()}`,
        categoryId: cat.id,
        ownerId: owner.id,
        status: 'ACTIVE',
        goalAmount: 10000000n,
        currency: 'NGN',
      },
    });
    id = c.id;
    slug = c.slug;
  });
  const submit = (patch = {}, key = randomUUID()) =>
    t
      .http()
      .post(`/campaigns/${slug}/reports`)
      .set('Idempotency-Key', key)
      .send({ ...reportBody, ...patch });
  async function report() {
    await submit().expect(202);
    return t.prisma.campaignReport.findFirstOrThrow({
      where: { campaignId: id },
    });
  }
  async function detail(reportId: string) {
    return (
      await t
        .http()
        .get(`/admin/reports/${reportId}`)
        .set(auth(admin))
        .expect(200)
    ).body;
  }
  const payload = (d: any, action: string) => ({
    action,
    reason: 'Investigating the campaign budget before further activity.',
    expectedReportUpdatedAt: d.report.updatedAt,
    expectedCampaignUpdatedAt: d.controls.updatedAt,
  });
  const act = (d: any, action: string, user = admin) =>
    t
      .http()
      .post(`/admin/reports/${d.report.id}/actions`)
      .set(auth(user))
      .send(payload(d, action));
  it('accepts guest reports with private acknowledgements and idempotent retries', async () => {
    const key = randomUUID();
    const r = await submit({}, key).expect(202);
    expect(r.body).toEqual({ received: true });
    await submit({}, key).expect(202);
    await submit(
      { details: 'A different concern with enough detail to investigate.' },
      key,
    ).expect(409);
    expect(
      await t.prisma.campaignReport.count({ where: { campaignId: id } }),
    ).toBe(1);
    expect(
      (await t.prisma.campaign.findUniqueOrThrow({ where: { id } })).status,
    ).toBe('ACTIVE');
  });
  it('validates concerns and does not expose unpublished campaigns', async () => {
    await submit({ details: 'short' }).expect(400);
    await submit({ category: 'INVALID' }).expect(400);
    await submit({ details: 'x'.repeat(2001) }).expect(400);
    await t
      .http()
      .post(`/campaigns/${slug}/reports`)
      .send(reportBody)
      .expect(400);
    await t.prisma.campaign.update({
      where: { id },
      data: { status: 'DRAFT' },
    });
    await submit().expect(404);
    await t.prisma.campaign.update({
      where: { id },
      data: { status: 'ENDED' },
    });
    await submit().expect(202);
  });
  it('keeps reports and audit notes out of public and organiser responses', async () => {
    const r = await report();
    await t.http().get('/admin/reports').expect(401);
    await t.http().get('/admin/reports').set(auth(owner)).expect(403);
    await t.http().get(`/admin/reports/${r.id}`).set(auth(owner)).expect(403);
    await t.http().get(`/campaigns/${slug}/reports`).expect(404);
    const publicView = await t.http().get(`/campaigns/${slug}`).expect(200);
    expect(JSON.stringify(publicView.body)).not.toContain(reportBody.details);
    expect(publicView.body).not.toHaveProperty('moderationPaused');
    const own = await t
      .http()
      .get('/campaigns/mine')
      .set(auth(owner))
      .expect(200);
    expect(JSON.stringify(own.body)).not.toContain(reportBody.details);
    const d = await detail(r.id);
    expect(d.report.details).toBe(reportBody.details);
    expect(d.report).not.toHaveProperty('idempotencyKeyHash');
  });
  it('pauses donations and blocks creator resume until an explicit lift', async () => {
    const r = await report();
    await act(await detail(r.id), 'PAUSE').expect(200);
    const c = await t.prisma.campaign.findUniqueOrThrow({ where: { id } });
    expect(c.status).toBe('PAUSED');
    expect(c.moderationPaused).toBe(true);
    await t.http().post(`/campaigns/${id}/resume`).set(auth(owner)).expect(409);
    await act(await detail(r.id), 'LIFT_PAUSE').expect(200);
    expect(
      (await t.prisma.campaign.findUniqueOrThrow({ where: { id } })).status,
    ).toBe('PAUSED');
    await t.http().post(`/campaigns/${id}/resume`).set(auth(owner)).expect(200);
    expect(
      await t.prisma.reportModerationAction.count({
        where: { reportId: r.id },
      }),
    ).toBe(2);
  });
  it('records payout restrictions in the existing freeze audit and does not auto-release on resolution', async () => {
    const r = await report();
    await act(await detail(r.id), 'FREEZE').expect(200);
    expect(
      (await t.prisma.campaign.findUniqueOrThrow({ where: { id } }))
        .payoutsFrozen,
    ).toBe(true);
    expect(
      await t.prisma.payoutFreezeEvent.count({
        where: { campaignId: id, frozen: true },
      }),
    ).toBe(1);
    await act(await detail(r.id), 'RESOLVE').expect(200);
    const d = await detail(r.id);
    expect(d.report.status).toBe('RESOLVED');
    expect(d.controls.payoutsFrozen).toBe(true);
    await act(d, 'UNFREEZE').expect(200);
    expect((await detail(r.id)).controls.payoutsFrozen).toBe(false);
    await act(await detail(r.id), 'DISMISS').expect(409);
  });
  it('rejects stale actions and only allows one concurrent action on the same report', async () => {
    const r = await report(),
      d = await detail(r.id);
    const results = await Promise.all([
      act(d, 'PAUSE'),
      act(d, 'DISMISS', other),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await t.prisma.reportModerationAction.count({
        where: { reportId: r.id },
      }),
    ).toBe(1);
    await act(d, 'FREEZE').expect(409);
  });
  it('rolls back restrictions and report state when audit attribution fails', async () => {
    const r = await report(),
      d = await detail(r.id);
    await expect(
      t.app
        .get(ReportsService)
        .moderate(
          {
            id: 'missing-actor',
            email: 'missing@example.com',
            role: 'ADMIN',
            emailVerified: true,
          },
          r.id,
          payload(d, 'PAUSE') as any,
        ),
    ).rejects.toThrow();
    const c = await t.prisma.campaign.findUniqueOrThrow({ where: { id } });
    expect(c.status).toBe('ACTIVE');
    expect(c.moderationPaused).toBe(false);
    expect(
      await t.prisma.reportModerationAction.count({
        where: { reportId: r.id },
      }),
    ).toBe(0);
  });
  it('validates action reasons and current roles, and prohibits self-moderation', async () => {
    const r = await report(),
      d = await detail(r.id);
    await t
      .http()
      .post(`/admin/reports/${r.id}/actions`)
      .set(auth(admin))
      .send({ ...payload(d, 'PAUSE'), reason: '  ' })
      .expect(400);
    await t
      .http()
      .post(`/admin/reports/${r.id}/actions`)
      .set(auth(owner))
      .send(payload(d, 'PAUSE'))
      .expect(403);
    await t.prisma.campaign.update({
      where: { id },
      data: { ownerId: admin.id },
    });
    await act(await detail(r.id), 'PAUSE').expect(403);
    const revoked = await signUpUser(t, { admin: true });
    await t.prisma.user.update({
      where: { id: revoked.id },
      data: { role: 'USER' },
    });
    await t.http().get('/admin/reports').set(auth(revoked)).expect(403);
  });
  it('paginates and filters reports and never leaks request hashes in the queue', async () => {
    const tag = `queue-${randomUUID()}`;
    await t.prisma.campaign.update({ where: { id }, data: { title: tag } });
    await t.prisma.campaignReport.createMany({
      data: Array.from({ length: 21 }, (_, i) => ({
        campaignId: id,
        ...reportBody,
        idempotencyKeyHash: randomUUID(),
        createdAt: new Date(1000000 + i),
      })),
    });
    const first = await t
      .http()
      .get(`/admin/reports?q=${tag}`)
      .set(auth(admin))
      .expect(200);
    expect(first.body.items).toHaveLength(20);
    expect(first.body.total).toBe(21);
    expect(first.body.items[0]).not.toHaveProperty('idempotencyKeyHash');
    const last = await t
      .http()
      .get(`/admin/reports?q=${tag}&page=2`)
      .set(auth(admin))
      .expect(200);
    expect(last.body.items).toHaveLength(1);
    await t.http().get('/admin/reports?page=0').set(auth(admin)).expect(400);
    await t
      .http()
      .get('/admin/reports?status=INVALID')
      .set(auth(admin))
      .expect(400);
  });
});
