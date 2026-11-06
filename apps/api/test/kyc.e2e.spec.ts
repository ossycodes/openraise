import { randomUUID } from 'node:crypto';
import { StorageService } from '../src/storage/storage.service.js';
import {
  createTestApp,
  signUpUser,
  type TestApp,
  type TestUser,
} from './helpers.js';

/** Enough of a JPEG for the type check: the SOI marker and an APP0 segment. */
const PHOTO = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.from('JFIF test identity document'),
]);

describe('identity verification', () => {
  let t: TestApp, admin: TestUser, otherAdmin: TestUser;
  const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.accessToken}` });
  const details = {
    documentType: 'NIN_SLIP',
    idNumber: '123 4567 8901',
    legalName: 'Ada  Chioma Obi',
    dateOfBirth: '1994-03-14',
  };

  beforeAll(async () => {
    t = await createTestApp();
    admin = await signUpUser(t, { admin: true, verified: true });
    otherAdmin = await signUpUser(t, { admin: true, verified: true });
  });
  afterAll(async () => {
    await t.app.close();
  });

  const creator = () => signUpUser(t, { verified: true, identity: false });
  const upload = (u: TestUser, body: Buffer = PHOTO, type = 'image/jpeg') =>
    t
      .http()
      .post('/kyc/document')
      .set(auth(u))
      .set('Content-Type', type)
      .send(body);
  async function submitted(u: TestUser, patch = {}) {
    const doc = await upload(u).expect(201);
    return t
      .http()
      .post('/kyc')
      .set(auth(u))
      .send({ ...details, documentKey: doc.body.documentKey, ...patch });
  }
  async function pending(u: TestUser) {
    const res = await submitted(u);
    expect(res.status).toBe(201);
    return t.prisma.identityVerification.findUniqueOrThrow({
      where: { id: res.body.id },
    });
  }
  const decide = (id: string, body: object, as = admin) =>
    t.http().post(`/admin/kyc/${id}/decision`).set(auth(as)).send(body);

  it('starts unverified and needs a confirmed email', async () => {
    const fresh = await signUpUser(t);
    const status = await t.http().get('/kyc').set(auth(fresh)).expect(200);
    expect(status.body).toMatchObject({
      status: 'NONE',
      provider: 'manual',
      documentRequired: true,
      verification: null,
    });
    await upload(fresh).expect(403);
    await t.http().get('/kyc').expect(401);
  });

  it('accepts only real image bytes up to 5 MB, and stores them encrypted', async () => {
    const u = await creator();
    await upload(u, Buffer.from('not a picture'), 'image/jpeg').expect(400);
    await upload(u, PHOTO, 'application/octet-stream').expect(415);
    await upload(
      u,
      Buffer.concat([PHOTO, Buffer.alloc(5 * 1024 * 1024)]),
    ).expect(413);

    const res = await upload(u).expect(201);
    expect(res.body.documentKey).toMatch(
      new RegExp(`^kyc/${u.id}/[A-Za-z0-9_-]+\\.jpg\\.enc$`),
    );
    const stored = await t.app
      .get(StorageService)
      .read(res.body.documentKey as string);
    expect(stored).not.toBeNull();
    expect(Buffer.from(stored!).includes(PHOTO)).toBe(false);
  });

  it('keeps only the last four ID digits and one open request at a time', async () => {
    const u = await creator();
    const res = await submitted(u);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'PENDING',
      documentType: 'NIN_SLIP',
      idNumberLast4: '8901',
      legalName: 'Ada Chioma Obi',
      dateOfBirth: '1994-03-14',
    });
    const row = await t.prisma.identityVerification.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    expect(JSON.stringify(row)).not.toContain('12345678901');

    await upload(u).expect(409);
    const status = await t.http().get('/kyc').set(auth(u)).expect(200);
    expect(status.body.status).toBe('PENDING');
  });

  it('checks the details it is sent', async () => {
    const u = await creator();
    const young = new Date();
    young.setUTCFullYear(young.getUTCFullYear() - 17);
    const tooYoung = await submitted(u, {
      dateOfBirth: young.toISOString().slice(0, 10),
    });
    expect(tooYoung.status).toBe(400);
    expect(tooYoung.body.errors[0].path).toBe('dateOfBirth');

    expect((await submitted(u, { idNumber: '1234' })).status).toBe(400);
    expect((await submitted(u, { legalName: 'Ada' })).status).toBe(400);

    // Someone else's upload can't be attached, and the photo is required.
    const other = await creator();
    const theirs = await upload(other).expect(201);
    await t
      .http()
      .post('/kyc')
      .set(auth(u))
      .send({ ...details, documentKey: theirs.body.documentKey })
      .expect(400);
    await t.http().post('/kyc').set(auth(u)).send(details).expect(400);
  });

  it('shows the queue and documents to administrators only', async () => {
    const u = await creator();
    const row = await pending(u);
    await t.http().get('/admin/kyc').set(auth(u)).expect(403);
    await t
      .http()
      .get(`/admin/kyc/${row.id}/document`)
      .set(auth(u))
      .expect(403);

    const queue = await t
      .http()
      .get(`/admin/kyc?q=${encodeURIComponent(u.email)}`)
      .set(auth(admin))
      .expect(200);
    expect(queue.body.items).toHaveLength(1);
    expect(queue.body.items[0]).toMatchObject({
      id: row.id,
      status: 'PENDING',
      user: { email: u.email },
    });
    expect(queue.body.pending).toBeGreaterThanOrEqual(1);

    const detail = await t
      .http()
      .get(`/admin/kyc/${row.id}`)
      .set(auth(admin))
      .expect(200);
    expect(detail.body.verification.hasDocument).toBe(true);
    expect(detail.body.verification).not.toHaveProperty('documentKey');

    const doc = await t
      .http()
      .get(`/admin/kyc/${row.id}/document`)
      .set(auth(admin))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(doc.headers['content-type']).toBe('image/jpeg');
    expect(doc.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(doc.body as Buffer).equals(PHOTO)).toBe(true);
  });

  it('records a rejection, deletes the document and lets the creator try again', async () => {
    const u = await creator();
    const row = await pending(u);
    const expectedUpdatedAt = row.updatedAt.toISOString();

    await decide(row.id, { decision: 'REJECT', expectedUpdatedAt }).expect(
      400,
    );
    await decide(row.id, {
      decision: 'REJECT',
      reason: 'The photo is too blurry to read.',
      expectedUpdatedAt: new Date(
        row.updatedAt.getTime() - 1000,
      ).toISOString(),
    }).expect(409);

    const res = await decide(row.id, {
      decision: 'REJECT',
      reason: 'The photo is too blurry to read.',
      expectedUpdatedAt,
    }).expect(200);
    expect(res.body.verification).toMatchObject({
      status: 'REJECTED',
      reason: 'The photo is too blurry to read.',
      hasDocument: false,
    });
    expect(await t.app.get(StorageService).head(row.documentKey!)).toBeNull();
    expect(t.mail.lastTo(u.email)?.subject).toBe(
      'We couldn’t verify your identity',
    );
    await decide(row.id, {
      decision: 'APPROVE',
      expectedUpdatedAt: res.body.verification.updatedAt,
    }).expect(409);

    const status = await t.http().get('/kyc').set(auth(u)).expect(200);
    expect(status.body.status).toBe('REJECTED');
    expect((await submitted(u)).status).toBe(201);
  });

  it('verifies with the confirmed name, and admins cannot verify themselves', async () => {
    const own = await t.prisma.identityVerification.create({
      data: {
        userId: otherAdmin.id,
        provider: 'manual',
        documentType: 'PASSPORT',
        idNumberLast4: '5678',
        legalName: 'Other Admin',
        dateOfBirth: new Date('1990-01-01T00:00:00Z'),
      },
    });
    await decide(
      own.id,
      { decision: 'APPROVE', expectedUpdatedAt: own.updatedAt.toISOString() },
      otherAdmin,
    ).expect(403);

    const u = await creator();
    const row = await pending(u);
    const res = await decide(row.id, {
      decision: 'APPROVE',
      verifiedName: 'Obi Ada Chioma',
      expectedUpdatedAt: row.updatedAt.toISOString(),
    }).expect(200);
    expect(res.body.verification).toMatchObject({
      status: 'VERIFIED',
      verifiedName: 'Obi Ada Chioma',
      reviewer: { name: 'Test User' },
    });
    expect(t.mail.lastTo(u.email)?.subject).toBe('Your identity is verified');

    const status = await t.http().get('/kyc').set(auth(u)).expect(200);
    expect(status.body).toMatchObject({
      status: 'VERIFIED',
      verification: { verifiedName: 'Obi Ada Chioma' },
    });
    await upload(u).expect(409);
  });

  describe('campaigns', () => {
    async function campaign(
      owner: TestUser,
      status: 'DRAFT' | 'PENDING_REVIEW',
    ) {
      const cat = await t.prisma.category.findFirstOrThrow();
      return t.prisma.campaign.create({
        data: {
          slug: `kyc-${randomUUID()}`,
          title: 'Help Ada finish nursing school',
          summary:
            'Ada needs help with her final year nursing fees this term.',
          story:
            'Ada is in her final year of nursing school. Her family has paid every term so far, but this year the fees doubled. Your support covers tuition, clinical placement and exam fees so she can graduate on time.',
          categoryId: cat.id,
          ownerId: owner.id,
          status,
          goalAmount: 10000000n,
          currency: 'NGN',
          submittedAt: status === 'PENDING_REVIEW' ? new Date() : null,
        },
      });
    }

    it('need a verified identity to submit', async () => {
      const u = await creator();
      const c = await campaign(u, 'DRAFT');
      const res = await t
        .http()
        .post(`/campaigns/${c.id}/submit`)
        .set(auth(u))
        .expect(403);
      expect(res.body.code).toBe('IDENTITY_UNVERIFIED');

      const verified = await signUpUser(t, { verified: true });
      const ok = await campaign(verified, 'DRAFT');
      await t
        .http()
        .post(`/campaigns/${ok.id}/submit`)
        .set(auth(verified))
        .expect(200);
    });

    it('need a verified organiser to be approved', async () => {
      const u = await creator();
      const c = await campaign(u, 'PENDING_REVIEW');
      const detail = await t
        .http()
        .get(`/admin/campaigns/${c.id}`)
        .set(auth(admin))
        .expect(200);
      expect(detail.body.organiser).toMatchObject({
        identityVerified: false,
        verifiedName: null,
      });
      const res = await t
        .http()
        .post(`/admin/campaigns/${c.id}/review`)
        .set(auth(admin))
        .send({
          decision: 'APPROVE',
          expectedUpdatedAt: detail.body.campaign.updatedAt,
        });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('IDENTITY_UNVERIFIED');
    });
  });
});
