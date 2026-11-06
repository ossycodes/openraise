import { CampaignsService } from '../src/campaigns/campaigns.service.js';
import { randomUUID } from 'node:crypto';
import {
  createTestApp,
  signUpUser,
  type TestApp,
  type TestUser,
} from './helpers.js';
describe('admin campaign review workspace', () => {
  let t: TestApp, owner: TestUser, admin: TestUser, otherAdmin: TestUser;
  const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.accessToken}` });
  beforeAll(async () => {
    t = await createTestApp();
    owner = await signUpUser(t, { verified: true });
    admin = await signUpUser(t, { admin: true, verified: true });
    otherAdmin = await signUpUser(t, { admin: true, verified: true });
  });
  afterAll(async () => {
    await t.app.close();
  });
  async function submission(user = owner) {
    const r = await t
      .http()
      .post('/campaigns')
      .set(auth(user))
      .send({
        title: `Review story ${randomUUID()}`,
        categorySlug: 'education',
        goalAmount: '50000000',
        summary: 'Help a student finish school.',
        story: 'This is the full campaign story. '.repeat(8),
      })
      .expect(201);
    await t
      .http()
      .post(`/campaigns/${r.body.id}/submit`)
      .set(auth(user))
      .expect(200);
    return (
      await t
        .http()
        .get(`/admin/campaigns/${r.body.id}`)
        .set(auth(admin))
        .expect(200)
    ).body;
  }
  const decide = (
    d: any,
    decision = 'APPROVE',
    user = admin,
    reason?: string,
  ) =>
    t
      .http()
      .post(`/admin/campaigns/${d.campaign.id}/review`)
      .set(auth(user))
      .send({
        decision,
        expectedUpdatedAt: d.campaign.updatedAt,
        ...(reason ? { reason } : {}),
      });
  it('keeps queue, private previews and decisions behind current admin permissions', async () => {
    const d = await submission();
    for (const path of [
      '/admin/campaigns',
      `/admin/campaigns/${d.campaign.id}`,
    ]) {
      await t.http().get(path).expect(401);
      await t.http().get(path).set(auth(owner)).expect(403);
    }
    await t
      .http()
      .post(`/admin/campaigns/${d.campaign.id}/review`)
      .set(auth(owner))
      .send({ decision: 'APPROVE', expectedUpdatedAt: d.campaign.updatedAt })
      .expect(403);
    await t.http().get(`/campaigns/${d.campaign.slug}`).expect(404);
    expect(d.organiser.emailVerified).toBe(true);
    expect(JSON.stringify(d)).not.toContain(owner.email);
    expect(d.organiser).not.toHaveProperty('passwordHash');
  });
  it('filters and searches a bounded queue and rejects invalid queries', async () => {
    const d = await submission();
    const r = await t
      .http()
      .get(`/admin/campaigns?q=${encodeURIComponent(d.campaign.title)}`)
      .set(auth(admin))
      .expect(200);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0].id).toBe(d.campaign.id);
    expect(r.body.limit).toBe(20);
    expect(r.body.pending).toBeGreaterThan(0);
    expect(r.body.items[0]).not.toHaveProperty('story');
    await t
      .http()
      .get('/admin/campaigns?status=DRAFT')
      .set(auth(admin))
      .expect(400);
    await t.http().get('/admin/campaigns?page=0').set(auth(admin)).expect(400);
    await t
      .http()
      .get('/admin/campaigns?q=' + 'a'.repeat(101))
      .set(auth(admin))
      .expect(400);
    expect(
      (
        await t
          .http()
          .get('/admin/campaigns?q=not-a-real-campaign-xyz')
          .set(auth(admin))
          .expect(200)
      ).body.items,
    ).toEqual([]);
  });
  it('approves atomically, publishes and retains the reviewer and submission version', async () => {
    const d = await submission();
    await decide(d).expect(200);
    await t.http().get(`/campaigns/${d.campaign.slug}`).expect(200);
    const record = await t.prisma.campaignReview.findFirstOrThrow({
      where: { campaignId: d.campaign.id },
    });
    expect(record.reviewerId).toBe(admin.id);
    expect(record.decision).toBe('APPROVE');
    expect(record.reviewedVersion.toISOString()).toBe(d.campaign.updatedAt);
    await decide(d).expect(409);
    expect(
      await t.prisma.campaignReview.count({
        where: { campaignId: d.campaign.id },
      }),
    ).toBe(1);
  });
  it('requires a constructive reason, exposes it privately and supports revised submissions', async () => {
    const d = await submission();
    await decide(d, 'REJECT').expect(400);
    await decide(d, 'REJECT', admin, '  ').expect(400);
    await decide(
      d,
      'REJECT',
      admin,
      'Please explain how the tuition budget will be used.',
    ).expect(200);
    const own = (
      await t.http().get('/campaigns/mine').set(auth(owner)).expect(200)
    ).body.find((c: any) => c.id === d.campaign.id);
    expect(own.rejectionReason).toContain('tuition budget');
    await t
      .http()
      .patch(`/campaigns/${d.campaign.id}`)
      .set(auth(owner))
      .send({ summary: 'An updated tuition budget for school.' })
      .expect(200);
    await t
      .http()
      .post(`/campaigns/${d.campaign.id}/submit`)
      .set(auth(owner))
      .expect(200);
    await decide(d).expect(409);
    const fresh = (
      await t
        .http()
        .get(`/admin/campaigns/${d.campaign.id}`)
        .set(auth(admin))
        .expect(200)
    ).body;
    await decide(fresh).expect(200);
    expect(
      await t.prisma.campaignReview.count({
        where: { campaignId: d.campaign.id },
      }),
    ).toBe(2);
  });
  it('allows only one concurrent reviewer to decide', async () => {
    const d = await submission();
    const results = await Promise.all([
      decide(d, 'APPROVE', admin),
      decide(d, 'REJECT', otherAdmin, 'Please add a clearer budget.'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await t.prisma.campaignReview.count({
        where: { campaignId: d.campaign.id },
      }),
    ).toBe(1);
  });
  it('rolls back publishing if its audit record cannot be written', async () => {
    const d = await submission();
    await expect(
      t.app
        .get(CampaignsService)
        .decideReview(
          {
            id: 'nonexistent-reviewer',
            email: 'missing@example.com',
            role: 'ADMIN',
            emailVerified: true,
          },
          d.campaign.id,
          'APPROVE',
          undefined,
          d.campaign.updatedAt,
        ),
    ).rejects.toThrow();
    expect(
      (
        await t.prisma.campaign.findUniqueOrThrow({
          where: { id: d.campaign.id },
        })
      ).status,
    ).toBe('PENDING_REVIEW');
    expect(
      await t.prisma.campaignReview.count({
        where: { campaignId: d.campaign.id },
      }),
    ).toBe(0);
  });
  it('audits legacy decisions and prevents self-review and expired publication', async () => {
    const own = await submission(admin);
    await decide(own).expect(403);
    await t
      .http()
      .post(`/campaigns/${own.campaign.id}/approve`)
      .set(auth(admin))
      .expect(403);
    const d = await submission();
    await t
      .http()
      .post(`/campaigns/${d.campaign.id}/reject`)
      .set(auth(admin))
      .send({ reason: 'Please provide more information.' })
      .expect(200);
    expect(
      await t.prisma.campaignReview.count({
        where: { campaignId: d.campaign.id },
      }),
    ).toBe(1);
    const expired = await submission();
    await t.prisma.campaign.update({
      where: { id: expired.campaign.id },
      data: { endsAt: new Date(0) },
    });
    const fresh = (
      await t
        .http()
        .get(`/admin/campaigns/${expired.campaign.id}`)
        .set(auth(admin))
        .expect(200)
    ).body;
    await decide(fresh).expect(409);
  });
  it('uses the current database role even if an old admin token remains', async () => {
    const revoked = await signUpUser(t, { admin: true, verified: true });
    await t.prisma.user.update({
      where: { id: revoked.id },
      data: { role: 'USER' },
    });
    await t.http().get('/admin/campaigns').set(auth(revoked)).expect(403);
    await t.http().get('/admin/campaigns/missing').set(auth(admin)).expect(404);
  });
});
