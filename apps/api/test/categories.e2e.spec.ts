import { randomUUID } from 'node:crypto';
import { createTestApp, signUpUser, type TestApp } from './helpers.js';

describe('categories', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  const uniqueSlug = () => `test-${randomUUID().slice(0, 8)}`;

  it('lists the seeded categories in order', async () => {
    const res = await t.http().get('/categories').expect(200);
    const slugs = (res.body as { slug: string }[]).map((c) => c.slug);
    expect(slugs.slice(0, 3)).toEqual(['medical', 'education', 'emergencies']);
    expect(slugs).toContain('other');
    expect(res.body[0]).toEqual({
      id: 'cat_medical',
      slug: 'medical',
      name: 'Medical',
      description: 'Hospital bills, surgery, treatment and medicine.',
      sortOrder: 10,
    });
  });

  it('gets one by slug, 404 for unknown', async () => {
    await t
      .http()
      .get('/categories/funerals')
      .expect(200)
      .expect((r) => expect(r.body.name).toBe('Funerals & memorials'));
    await t.http().get('/categories/nope').expect(404);
  });

  it('only lets admins create', async () => {
    const user = await signUpUser(t);
    const admin = await signUpUser(t, { admin: true });
    const slug = uniqueSlug();
    const body = { slug, name: 'Faith', description: 'Churches and mosques.' };

    await t.http().post('/categories').send(body).expect(401);
    await t
      .http()
      .post('/categories')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send(body)
      .expect(403);
    await t
      .http()
      .post('/categories')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send(body)
      .expect(201)
      .expect((r) => expect(r.body).toMatchObject({ slug, sortOrder: 0 }));

    await t
      .http()
      .post('/categories')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send(body)
      .expect(409);
  });

  it('validates slugs', async () => {
    const admin = await signUpUser(t, { admin: true });
    await t
      .http()
      .post('/categories')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ slug: 'Not a slug!', name: 'X' })
      .expect(400);
  });

  it('lets admins rename and reorder, but not change the slug', async () => {
    const admin = await signUpUser(t, { admin: true });
    const slug = uniqueSlug();
    const auth = { Authorization: `Bearer ${admin.accessToken}` };
    await t.http().post('/categories').set(auth).send({ slug, name: 'Before' }).expect(201);

    await t
      .http()
      .patch(`/categories/${slug}`)
      .set(auth)
      .send({ name: 'After', sortOrder: 5 })
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ slug, name: 'After', sortOrder: 5 }));

    await t.http().patch(`/categories/${slug}`).set(auth).send({}).expect(400);
    await t.http().patch('/categories/missing').set(auth).send({ name: 'X' }).expect(404);
  });
});
