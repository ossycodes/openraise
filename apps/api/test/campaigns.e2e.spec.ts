import { createTestApp, signUpUser, type TestApp, type TestUser } from './helpers.js';

const STORY =
  'Ada is a final-year nursing student in Ibadan. Her father lost his shop in a fire in March, ' +
  'and the family cannot pay her last two semesters of fees.';

describe('campaigns', () => {
  let t: TestApp;
  let owner: TestUser;
  let admin: TestUser;
  let stranger: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await signUpUser(t, { verified: true });
    admin = await signUpUser(t, { admin: true });
    stranger = await signUpUser(t);
  });

  afterAll(async () => {
    await t.app.close();
  });

  const as = (u: TestUser) => ({ Authorization: `Bearer ${u.accessToken}` });

  async function createDraft(body: Record<string, unknown> = {}) {
    const res = await t
      .http()
      .post('/campaigns')
      .set(as(owner))
      .send({ title: 'Help Ada finish nursing school', categorySlug: 'education', goalAmount: '50000000', ...body })
      .expect(201);
    return res.body as { id: string; slug: string; status: string };
  }

  async function makeActive() {
    const draft = await createDraft({ summary: 'Two semesters of fees after a fire.', story: STORY });
    await t.http().post(`/campaigns/${draft.id}/submit`).set(as(owner)).expect(200);
    await t.http().post(`/campaigns/${draft.id}/approve`).set(as(admin)).expect(200);
    return draft;
  }

  describe('drafts', () => {
    it('creates a private draft with a readable slug', async () => {
      const draft = await createDraft();
      expect(draft).toMatchObject({
        status: 'DRAFT',
        currency: 'NGN',
        goalAmount: '50000000',
        raisedAmount: '0',
        category: { slug: 'education', name: 'Education' },
        owner: { name: 'Test User' },
      });
      expect(draft.slug).toMatch(/^help-ada-finish-nursing-school-[a-z2-9]{5}$/);

      // Owner sees it; the public and other users get 404.
      await t.http().get(`/campaigns/${draft.slug}`).set(as(owner)).expect(200);
      await t.http().get(`/campaigns/${draft.slug}`).expect(404);
      await t.http().get(`/campaigns/${draft.slug}`).set(as(stranger)).expect(404);
      await t.http().get(`/campaigns/${draft.slug}`).set(as(admin)).expect(200);
    });

    it('validates input', async () => {
      const res = await t
        .http()
        .post('/campaigns')
        .set(as(owner))
        .send({ title: 'Hi', categorySlug: 'education', goalAmount: 500 })
        .expect(400);
      const paths = (res.body.errors as { path: string }[]).map((e) => e.path);
      expect(paths).toEqual(expect.arrayContaining(['title', 'goalAmount']));

      await t
        .http()
        .post('/campaigns')
        .set(as(owner))
        .send({ title: 'A real title', categorySlug: 'not-a-category', goalAmount: '1000' })
        .expect(400);
      await t.http().post('/campaigns').send({ title: 'Anonymous' }).expect(401);
    });

    it('lets only the owner edit and delete', async () => {
      const draft = await createDraft();
      await t
        .http()
        .patch(`/campaigns/${draft.id}`)
        .set(as(stranger))
        .send({ title: 'Hijacked title' })
        .expect(404);
      await t
        .http()
        .patch(`/campaigns/${draft.id}`)
        .set(as(owner))
        .send({ summary: 'Updated summary text', currency: 'USD', categorySlug: 'medical' })
        .expect(200)
        .expect((r) =>
          expect(r.body).toMatchObject({
            summary: 'Updated summary text',
            currency: 'USD',
            category: { slug: 'medical' },
          }),
        );

      await t.http().delete(`/campaigns/${draft.id}`).set(as(stranger)).expect(404);
      await t.http().delete(`/campaigns/${draft.id}`).set(as(owner)).expect(204);
      await t.http().get(`/campaigns/${draft.slug}`).set(as(owner)).expect(404);
    });

    it('lists the owner’s campaigns', async () => {
      const draft = await createDraft();
      const res = await t.http().get('/campaigns/mine').set(as(owner)).expect(200);
      expect((res.body as { id: string }[]).map((c) => c.id)).toContain(draft.id);
      const theirs = await t.http().get('/campaigns/mine').set(as(stranger)).expect(200);
      expect(theirs.body).toEqual([]);
    });
  });

  describe('submitting', () => {
    it('explains what is missing', async () => {
      const draft = await createDraft();
      const res = await t.http().post(`/campaigns/${draft.id}/submit`).set(as(owner)).expect(400);
      const paths = (res.body.errors as { path: string }[]).map((e) => e.path);
      expect(paths).toEqual(['summary', 'story']);
    });

    it('needs a verified email', async () => {
      const unverified = await signUpUser(t);
      const res = await t
        .http()
        .post('/campaigns')
        .set(as(unverified))
        .send({
          title: 'An unverified campaign',
          categorySlug: 'medical',
          goalAmount: '100000',
          summary: 'A long enough summary',
          story: STORY,
        })
        .expect(201);
      await t.http().post(`/campaigns/${res.body.id}/submit`).set(as(unverified)).expect(403);
    });

    it('locks editing while in review and fixes the currency afterwards', async () => {
      const draft = await createDraft({ summary: 'Two semesters of fees.', story: STORY });
      await t
        .http()
        .post(`/campaigns/${draft.id}/submit`)
        .set(as(owner))
        .expect(200)
        .expect((r) => expect(r.body.status).toBe('PENDING_REVIEW'));

      await t.http().patch(`/campaigns/${draft.id}`).set(as(owner)).send({ title: 'Edited in review' }).expect(409);
      await t.http().post(`/campaigns/${draft.id}/submit`).set(as(owner)).expect(409);
      await t.http().delete(`/campaigns/${draft.id}`).set(as(owner)).expect(409);

      await t.http().post(`/campaigns/${draft.id}/approve`).set(as(admin)).expect(200);
      await t.http().patch(`/campaigns/${draft.id}`).set(as(owner)).send({ currency: 'USD' }).expect(409);
      await t
        .http()
        .patch(`/campaigns/${draft.id}`)
        .set(as(owner))
        .send({ title: 'Help Ada finish nursing school in Ibadan' })
        .expect(200);
    });
  });

  describe('review', () => {
    it('only admins approve or reject', async () => {
      const draft = await createDraft({ summary: 'Two semesters of fees.', story: STORY });
      await t.http().post(`/campaigns/${draft.id}/submit`).set(as(owner)).expect(200);
      await t.http().post(`/campaigns/${draft.id}/approve`).set(as(owner)).expect(403);
      await t.http().post(`/campaigns/${draft.id}/reject`).set(as(stranger)).send({ reason: 'Nope nope' }).expect(403);
    });

    it('rejects with a reason only the owner sees, then accepts a resubmission', async () => {
      const draft = await createDraft({ summary: 'Two semesters of fees.', story: STORY });
      await t.http().post(`/campaigns/${draft.id}/submit`).set(as(owner)).expect(200);
      await t
        .http()
        .post(`/campaigns/${draft.id}/reject`)
        .set(as(admin))
        .send({ reason: 'Add a photo of the fee invoice' })
        .expect(200)
        .expect((r) => expect(r.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'Add a photo of the fee invoice' }));

      await t.http().get(`/campaigns/${draft.slug}`).expect(404);
      await t
        .http()
        .patch(`/campaigns/${draft.id}`)
        .set(as(owner))
        .send({ story: `${STORY} The invoice is attached.` })
        .expect(200);
      await t
        .http()
        .post(`/campaigns/${draft.id}/submit`)
        .set(as(owner))
        .expect(200)
        .expect((r) => expect(r.body).toMatchObject({ status: 'PENDING_REVIEW', rejectionReason: null }));
    });

    it('publishes on approval', async () => {
      const draft = await makeActive();
      const res = await t.http().get(`/campaigns/${draft.slug}`).expect(200);
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.publishedAt).toEqual(expect.any(String));
      expect(res.body).not.toHaveProperty('rejectionReason');

      // Reviewing it again is a conflict, not a silent no-op.
      await t.http().post(`/campaigns/${draft.id}/approve`).set(as(admin)).expect(409);
      await t.http().post('/campaigns/does-not-exist/approve').set(as(admin)).expect(404);
    });
  });

  describe('live campaigns', () => {
    it('pause, resume and end', async () => {
      const c = await makeActive();
      await t.http().post(`/campaigns/${c.id}/pause`).set(as(stranger)).expect(404);
      await t.http().post(`/campaigns/${c.id}/pause`).set(as(owner)).expect(200)
        .expect((r) => expect(r.body.status).toBe('PAUSED'));
      // Paused campaigns stay visible so existing links keep working.
      await t.http().get(`/campaigns/${c.slug}`).expect(200);
      await t.http().post(`/campaigns/${c.id}/resume`).set(as(owner)).expect(200)
        .expect((r) => expect(r.body.status).toBe('ACTIVE'));
      await t.http().post(`/campaigns/${c.id}/end`).set(as(owner)).expect(200)
        .expect((r) => expect(r.body).toMatchObject({ status: 'ENDED', endedAt: expect.any(String) }));

      await t.http().post(`/campaigns/${c.id}/resume`).set(as(owner)).expect(409);
      await t.http().patch(`/campaigns/${c.id}`).set(as(owner)).send({ title: 'Too late to edit' }).expect(409);
    });

    it('lists only active campaigns, newest first, filtered by category', async () => {
      const first = await makeActive();
      const second = await makeActive();
      const draft = await createDraft();

      const res = await t.http().get('/campaigns?category=education&limit=50').expect(200);
      const ids = (res.body.items as { id: string }[]).map((c) => c.id);
      expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
      expect(ids).not.toContain(draft.id);
      expect(res.body).toMatchObject({ page: 1, limit: 50 });
      expect(res.body.total).toBeGreaterThanOrEqual(2);

      const medical = await t.http().get('/campaigns?category=medical&limit=50').expect(200);
      expect((medical.body.items as { id: string }[]).map((c) => c.id)).not.toContain(first.id);

      await t.http().get('/campaigns?limit=500').expect(400);
    });
  });
});
