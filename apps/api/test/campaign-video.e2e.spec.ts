import { randomUUID } from 'node:crypto';
import {
  createTestApp,
  signUpUser,
  type TestApp,
  type TestUser,
} from './helpers.js';
const canonical = 'https://www.youtube.com/watch?v=M7lc1UVf-VE';
describe('campaign YouTube videos', () => {
  let t: TestApp, owner: TestUser, other: TestUser, admin: TestUser;
  beforeAll(async () => {
    t = await createTestApp();
    owner = await signUpUser(t, { verified: true });
    other = await signUpUser(t);
    admin = await signUpUser(t, { admin: true });
  });
  afterAll(async () => {
    await t.app.close();
  });
  const input = {
    title: `A campaign with a video ${randomUUID()}`,
    categorySlug: 'education',
    goalAmount: '50000000',
    summary: 'Hear directly from the organiser.',
    story:
      'A campaign story that explains the fundraiser to every visitor. '.repeat(
        4,
      ),
  };
  const as = (user: TestUser) => ({
    Authorization: `Bearer ${user.accessToken}`,
  });
  it('normalizes a video on create and returns it on published detail and list', async () => {
    const response = await t
      .http()
      .post('/campaigns')
      .set(as(owner))
      .send({
        ...input,
        videoUrl: 'https://youtu.be/M7lc1UVf-VE?si=tracking&autoplay=1',
      })
      .expect(201);
    expect(response.body.videoUrl).toBe(canonical);
    const id = response.body.id;
    expect(
      (await t.prisma.campaign.findUniqueOrThrow({ where: { id } })).videoUrl,
    ).toBe(canonical);
    await t.http().post(`/campaigns/${id}/submit`).set(as(owner)).expect(200);
    await t.http().post(`/campaigns/${id}/approve`).set(as(admin)).expect(200);
    const detail = await t
      .http()
      .get(`/campaigns/${response.body.slug}`)
      .expect(200);
    expect(detail.body.videoUrl).toBe(canonical);
    const list = await t
      .http()
      .get(`/campaigns?limit=50&q=${encodeURIComponent(input.title)}`)
      .expect(200);
    expect(
      list.body.items.find((c: { id: string }) => c.id === id)?.videoUrl,
    ).toBe(canonical);
  });
  it('supports adding, replacing and removing a video without altering text or media', async () => {
    const draft = await t
      .http()
      .post('/campaigns')
      .set(as(owner))
      .send(input)
      .expect(201);
    expect(draft.body.videoUrl).toBeNull();
    const path = `/campaigns/${draft.body.id}`;
    const added = await t
      .http()
      .patch(path)
      .set(as(owner))
      .send({ videoUrl: canonical })
      .expect(200);
    expect(added.body.videoUrl).toBe(canonical);
    const replaced = await t
      .http()
      .patch(path)
      .set(as(owner))
      .send({ videoUrl: 'https://youtube.com/shorts/AAAAAAAAAAA' })
      .expect(200);
    expect(replaced.body.videoUrl).toBe(
      'https://www.youtube.com/watch?v=AAAAAAAAAAA',
    );
    const unchanged = await t
      .http()
      .patch(path)
      .set(as(owner))
      .send({ title: 'An updated campaign title' })
      .expect(200);
    expect(unchanged.body.videoUrl).toBe(
      'https://www.youtube.com/watch?v=AAAAAAAAAAA',
    );
    const removed = await t
      .http()
      .patch(path)
      .set(as(owner))
      .send({ videoUrl: null })
      .expect(200);
    expect(removed.body.videoUrl).toBeNull();
    expect(removed.body.story).toBe(input.story.trim());
    expect(removed.body.images).toEqual([]);
  });
  it('rejects raw HTML, foreign hosts, playlists and malformed IDs without changing an existing video', async () => {
    const draft = await t
      .http()
      .post('/campaigns')
      .set(as(owner))
      .send({ ...input, videoUrl: canonical })
      .expect(201);
    for (const videoUrl of [
      '<iframe src="https://evil.example"></iframe>',
      'https://youtube.com.evil.example/watch?v=M7lc1UVf-VE',
      'https://youtube.com/playlist?list=PLexample',
      'javascript:alert(1)',
      'https://youtu.be/bad',
    ]) {
      await t
        .http()
        .post('/campaigns')
        .set(as(owner))
        .send({ ...input, videoUrl })
        .expect(400);
      await t
        .http()
        .patch(`/campaigns/${draft.body.id}`)
        .set(as(owner))
        .send({ videoUrl })
        .expect(400);
    }
    expect(
      (
        await t.prisma.campaign.findUniqueOrThrow({
          where: { id: draft.body.id },
        })
      ).videoUrl,
    ).toBe(canonical);
  });
  it('keeps existing ownership and review locks for video edits', async () => {
    const draft = await t
      .http()
      .post('/campaigns')
      .set(as(owner))
      .send(input)
      .expect(201);
    const path = `/campaigns/${draft.body.id}`;
    await t.http().patch(path).send({ videoUrl: canonical }).expect(401);
    await t
      .http()
      .patch(path)
      .set(as(other))
      .send({ videoUrl: canonical })
      .expect(404);
    await t.http().post(`${path}/submit`).set(as(owner)).expect(200);
    await t
      .http()
      .patch(path)
      .set(as(owner))
      .send({ videoUrl: canonical })
      .expect(409);
  });
});
