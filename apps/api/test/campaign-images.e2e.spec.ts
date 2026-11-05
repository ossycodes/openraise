import { createTestApp, signUpUser, type TestApp, type TestUser } from './helpers.js';

// A real 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const STORY =
  'Ada is a final-year nursing student in Ibadan. Her father lost his shop in a fire in March, ' +
  'and the family cannot pay her last two semesters of fees.';

interface Ticket {
  key: string;
  uploadUrl: string;
  headers: Record<string, string>;
}
interface Image {
  id: string;
  url: string;
  position: number;
}

describe('campaign images', () => {
  let t: TestApp;
  let owner: TestUser;
  let stranger: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await signUpUser(t, { verified: true });
    stranger = await signUpUser(t);
  });

  afterAll(async () => {
    await t.app.close();
  });

  const as = (u: TestUser) => ({ Authorization: `Bearer ${u.accessToken}` });

  async function draft() {
    const res = await t
      .http()
      .post('/campaigns')
      .set(as(owner))
      .send({
        title: 'Help Ada finish nursing school',
        categorySlug: 'education',
        goalAmount: '50000000',
        summary: 'Two semesters of fees.',
        story: STORY,
      })
      .expect(201);
    return res.body as { id: string; slug: string };
  }

  async function ticket(campaignId: string, contentType = 'image/png', size = PNG.length) {
    const res = await t
      .http()
      .post(`/campaigns/${campaignId}/images/upload-url`)
      .set(as(owner))
      .send({ contentType, size })
      .expect(201);
    return res.body as Ticket;
  }

  async function upload(tk: Ticket, body: Buffer = PNG) {
    const res = await fetch(tk.uploadUrl, {
      method: 'PUT',
      headers: tk.headers,
      body: new Uint8Array(body),
    });
    expect(res.ok).toBe(true);
  }

  async function addImage(campaignId: string): Promise<Image[]> {
    const tk = await ticket(campaignId);
    await upload(tk);
    const res = await t
      .http()
      .post(`/campaigns/${campaignId}/images`)
      .set(as(owner))
      .send({ key: tk.key })
      .expect(201);
    return res.body as Image[];
  }

  it('uploads straight to storage and shows the first image as the cover', async () => {
    const c = await draft();
    const images = await addImage(c.id);
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ position: 0, contentType: 'image/png', size: PNG.length });

    const campaign = await t.http().get(`/campaigns/${c.slug}`).set(as(owner)).expect(200);
    expect(campaign.body.coverImageUrl).toBe(images[0]!.url);
    expect(campaign.body.images).toHaveLength(1);

    // Publicly readable, byte for byte.
    const file = await fetch(images[0]!.url);
    expect(Buffer.from(await file.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it('checks the real file type and deletes fakes', async () => {
    const c = await draft();
    const tk = await ticket(c.id, 'image/png');
    await upload(tk, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));

    await t
      .http()
      .post(`/campaigns/${c.id}/images`)
      .set(as(owner))
      .send({ key: tk.key })
      .expect(400)
      .expect((r) => expect(r.body.message).toBe('Upload a JPEG, PNG or WebP image'));

    const gone = await fetch(`${tk.uploadUrl.split('?')[0]}`);
    expect(gone.status).toBe(404);
  });

  it('refuses files over 5 MB, even if declared smaller', async () => {
    const c = await draft();
    await t
      .http()
      .post(`/campaigns/${c.id}/images/upload-url`)
      .set(as(owner))
      .send({ contentType: 'image/png', size: 6 * 1024 * 1024 })
      .expect(400);

    const tk = await ticket(c.id);
    await upload(tk, Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]));
    await t
      .http()
      .post(`/campaigns/${c.id}/images`)
      .set(as(owner))
      .send({ key: tk.key })
      .expect(400)
      .expect((r) => expect(r.body.message).toBe('Images must be 5 MB or smaller'));
  });

  it('only accepts JPEG, PNG and WebP', async () => {
    const c = await draft();
    await t
      .http()
      .post(`/campaigns/${c.id}/images/upload-url`)
      .set(as(owner))
      .send({ contentType: 'image/svg+xml', size: 100 })
      .expect(400);
  });

  it('refuses uploads from another campaign or never uploaded', async () => {
    const a = await draft();
    const b = await draft();
    const tk = await ticket(a.id);
    await upload(tk);
    await t.http().post(`/campaigns/${b.id}/images`).set(as(owner)).send({ key: tk.key }).expect(400);
    const missing = await ticket(a.id);
    await t.http().post(`/campaigns/${a.id}/images`).set(as(owner)).send({ key: missing.key }).expect(400);
  });

  it('is owner only', async () => {
    const c = await draft();
    await t
      .http()
      .post(`/campaigns/${c.id}/images/upload-url`)
      .set(as(stranger))
      .send({ contentType: 'image/png', size: 10 })
      .expect(404);
    await t
      .http()
      .post(`/campaigns/${c.id}/images/upload-url`)
      .send({ contentType: 'image/png', size: 10 })
      .expect(401);
  });

  it('reorders, deletes and keeps positions tidy', async () => {
    const c = await draft();
    await addImage(c.id);
    await addImage(c.id);
    const [first, second, third] = await addImage(c.id);

    const reordered = await t
      .http()
      .put(`/campaigns/${c.id}/images/order`)
      .set(as(owner))
      .send({ imageIds: [third!.id, first!.id, second!.id] })
      .expect(200);
    expect((reordered.body as Image[]).map((i) => i.id)).toEqual([third!.id, first!.id, second!.id]);

    await t
      .http()
      .put(`/campaigns/${c.id}/images/order`)
      .set(as(owner))
      .send({ imageIds: [third!.id, first!.id] })
      .expect(400);

    const afterDelete = await t
      .http()
      .delete(`/campaigns/${c.id}/images/${third!.id}`)
      .set(as(owner))
      .expect(200);
    expect((afterDelete.body as Image[]).map((i) => [i.id, i.position])).toEqual([
      [first!.id, 0],
      [second!.id, 1],
    ]);
    expect((await fetch(third!.url)).status).toBe(404);

    const campaign = await t.http().get(`/campaigns/${c.slug}`).set(as(owner)).expect(200);
    expect(campaign.body.coverImageUrl).toBe(first!.url);
  });

  it('caps a campaign at 10 images', async () => {
    const c = await draft();
    await t.prisma.campaignImage.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        campaignId: c.id,
        key: `campaigns/${c.id}/placeholder-${i}.png`,
        contentType: 'image/png',
        size: 1,
        position: i,
      })),
    });
    await t
      .http()
      .post(`/campaigns/${c.id}/images/upload-url`)
      .set(as(owner))
      .send({ contentType: 'image/png', size: 10 })
      .expect(409);
  });

  it('is locked while the campaign is in review', async () => {
    const c = await draft();
    await t.http().post(`/campaigns/${c.id}/submit`).set(as(owner)).expect(200);
    await t
      .http()
      .post(`/campaigns/${c.id}/images/upload-url`)
      .set(as(owner))
      .send({ contentType: 'image/png', size: 10 })
      .expect(409);
  });

  it('deletes stored files when a draft is deleted', async () => {
    const c = await draft();
    const [image] = await addImage(c.id);
    await t.http().delete(`/campaigns/${c.id}`).set(as(owner)).expect(204);
    expect((await fetch(image!.url)).status).toBe(404);
  });
});
