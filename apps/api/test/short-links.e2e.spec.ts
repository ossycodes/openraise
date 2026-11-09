import { randomUUID } from 'node:crypto';
import { createTestApp, signUpUser, type TestApp, type TestUser } from './helpers.js';

const CODE = /^[abcdefghjkmnpqrstuvwxyz23456789]{5}$/;

describe('campaign short links', () => {
  let t: TestApp;
  let owner: TestUser;
  beforeAll(async () => {
    t = await createTestApp();
    owner = await signUpUser(t, { verified: true });
  });
  afterAll(async () => {
    await t.app.close();
  });

  const resolve = (code: string) => t.http().get(`/short-links/${code}`);

  it('gives a new campaign its slug suffix as the short code', async () => {
    const res = await t
      .http()
      .post('/campaigns')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Help Ada finish nursing school', categorySlug: 'education', goalAmount: '50000000' })
      .expect(201);
    expect(res.body.shortCode).toMatch(CODE);
    expect(res.body.slug.endsWith(`-${res.body.shortCode}`)).toBe(true);
  });

  it('resolves public campaigns only, in any case', async () => {
    const res = await t
      .http()
      .post('/campaigns')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Roof for the community hall', categorySlug: 'education', goalAmount: '50000000' })
      .expect(201);
    const { id, slug, shortCode } = res.body as { id: string; slug: string; shortCode: string };

    // A draft can't be found by guessing its code, just as with its slug.
    await resolve(shortCode).expect(404);

    await t.prisma.campaign.update({ where: { id }, data: { status: 'ACTIVE' } });
    const found = await resolve(shortCode).expect(200);
    expect(found.body).toEqual({ slug });
    expect(found.headers['cache-control']).toBe('public, max-age=300');
    expect((await resolve(shortCode.toUpperCase()).expect(200)).body).toEqual({ slug });

    await t.prisma.campaign.update({ where: { id }, data: { status: 'ENDED' } });
    await resolve(shortCode).expect(200);
    await t.prisma.campaign.update({ where: { id }, data: { status: 'REJECTED' } });
    await resolve(shortCode).expect(404);
  });

  it('answers 404 for malformed and unknown codes', async () => {
    for (const code of ['abc', 'abcdef', 'ab-cd', '%20%20%20%20%20']) await resolve(code).expect(404);
    // "o" is not in the code alphabet, so this can never exist.
    await resolve('ooooo').expect(404);
  });

  it('gives campaigns written directly a valid, unique code', async () => {
    const category = await t.prisma.category.findFirstOrThrow();
    const fields = {
      title: 'Written directly',
      ownerId: owner.id,
      categoryId: category.id,
      currency: 'NGN',
      goalAmount: 100_000n,
    };
    const row = await t.prisma.campaign.create({ data: { ...fields, slug: `direct-${randomUUID()}` } });
    expect(row.shortCode).toMatch(CODE);
    await expect(
      t.prisma.campaign.create({
        data: { ...fields, slug: `direct-${randomUUID()}`, shortCode: row.shortCode },
      }),
    ).rejects.toThrow();
    await expect(
      t.prisma.campaign.create({ data: { ...fields, slug: `direct-${randomUUID()}`, shortCode: 'Ab0O1' } }),
    ).rejects.toThrow();
  });
});
