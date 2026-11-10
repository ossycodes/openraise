import { KycRetentionService } from '../src/kyc/kyc-retention.js';
import { StorageService } from '../src/storage/storage.service.js';
import { createTestApp, signUpUser, type TestApp, type TestUser } from './helpers.js';

/** Enough of a JPEG for the type check. */
const PHOTO = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.from('JFIF registration certificate'),
]);
const DAY = 24 * 60 * 60 * 1000;

describe('organisation verification', () => {
  let t: TestApp;
  let reviewer: TestUser;
  beforeAll(async () => {
    t = await createTestApp();
    reviewer = await signUpUser(t, { admin: true, verified: true });
  });
  afterAll(async () => {
    await t.app.close();
  });

  const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.accessToken}` });
  const verified = () => signUpUser(t, { verified: true });
  const tokenFor = (email: string) =>
    new URL(t.mail.lastTo(email)!.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;

  /** An organisation with an owner, an admin and an editor. */
  async function org() {
    const owner = await verified();
    const created = await t
      .http()
      .post('/organisations')
      .set(auth(owner))
      .send({ name: 'Grace Assembly Ibadan' })
      .expect(201);
    const { id, slug } = created.body.organisation as { id: string; slug: string };
    const join = async (role: string, u?: TestUser) => {
      u ??= await verified();
      await t.http().post(`/organisations/${id}/invites`).set(auth(owner)).send({ email: u.email, role }).expect(201);
      await t.http().post('/organisation-invites/accept').set(auth(u)).send({ token: tokenFor(u.email) }).expect(200);
      return u;
    };
    return { id, slug, owner, join, admin: await join('ADMIN'), editor: await join('EDITOR') };
  }
  const upload = (u: TestUser, id: string, body: Buffer = PHOTO, type = 'image/jpeg') =>
    t.http().post(`/organisations/${id}/verification/document`).set(auth(u)).set('Content-Type', type).send(body);
  const details = {
    registrationType: 'INCORPORATED_TRUSTEES',
    registrationNumber: 'it 123456',
    registeredName: 'The Incorporated Trustees of Grace Assembly',
  };
  /** Upload and send the details; expects it to be accepted. */
  async function submit(u: TestUser, id: string) {
    const doc = await upload(u, id).expect(201);
    return t
      .http()
      .post(`/organisations/${id}/verification`)
      .set(auth(u))
      .send({ ...details, documentKey: doc.body.documentKey })
      .expect(201);
  }
  const status = (u: TestUser, id: string) =>
    t.http().get(`/organisations/${id}/verification`).set(auth(u));
  const decide = (id: string, body: object, as = reviewer) =>
    t.http().post(`/admin/organisation-checks/${id}/decision`).set(auth(as)).send(body);
  const versionOf = async (id: string) =>
    (await t.http().get(`/admin/organisation-checks/${id}`).set(auth(reviewer)).expect(200)).body.verification
      .updatedAt as string;

  it('lets owners and admins send the certificate, once at a time', async () => {
    const o = await org();
    expect((await status(o.editor, o.id).expect(200)).body).toEqual({ status: 'NONE', verification: null });
    await status(await verified(), o.id).expect(404);
    await upload(o.editor, o.id).expect(403);
    await upload(o.owner, o.id, Buffer.from('not a picture')).expect(400);
    await upload(o.owner, o.id, PHOTO, 'application/pdf').expect(415);

    const doc = await upload(o.admin, o.id).expect(201);
    expect(doc.body.documentKey).toMatch(new RegExp(`^org-docs/${o.id}/`));
    // Stored encrypted.
    const stored = await t.app.get(StorageService).read(doc.body.documentKey);
    expect(Buffer.from(stored!).includes(Buffer.from('JFIF registration'))).toBe(false);

    const send = (body: object) =>
      t.http().post(`/organisations/${o.id}/verification`).set(auth(o.admin)).send(body);
    await send({ ...details, registrationNumber: '!!', documentKey: doc.body.documentKey }).expect(400);
    const other = await org();
    const foreign = await upload(other.owner, other.id).expect(201);
    await send({ ...details, documentKey: foreign.body.documentKey }).expect(400);

    const res = await send({ ...details, documentKey: doc.body.documentKey }).expect(201);
    expect(res.body).toMatchObject({
      status: 'PENDING',
      registrationNumber: 'IT 123456',
      registeredName: 'The Incorporated Trustees of Grace Assembly',
    });
    expect(res.body).not.toHaveProperty('documentKey');
    await upload(o.owner, o.id).expect(409);
    expect((await status(o.editor, o.id).expect(200)).body.status).toBe('PENDING');
  });

  it('is reviewed by an administrator outside the organisation, against the version seen', async () => {
    const o = await org();
    const sent = await submit(o.owner, o.id);
    const id = sent.body.id as string;
    const { documentKey } = await t.prisma.organisationVerification.findUniqueOrThrow({ where: { id } });

    await t.http().get('/admin/organisation-checks').set(auth(o.owner)).expect(403);
    const queue = await t.http().get('/admin/organisation-checks').set(auth(reviewer)).expect(200);
    expect(queue.body.pending).toBeGreaterThanOrEqual(1);
    const detail = await t.http().get(`/admin/organisation-checks/${id}`).set(auth(reviewer)).expect(200);
    expect(detail.body).toMatchObject({
      verification: { status: 'PENDING', hasDocument: true, registrationType: 'INCORPORATED_TRUSTEES' },
      organisation: { id: o.id, name: 'Grace Assembly Ibadan', members: 3 },
      submittedBy: { email: o.owner.email },
    });
    const photo = await t
      .http()
      .get(`/admin/organisation-checks/${id}/document`)
      .set(auth(reviewer))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.compare(photo.body as Buffer, PHOTO)).toBe(0);
    expect(photo.headers['cache-control']).toBe('private, no-store');

    // An administrator who belongs to the organisation can't decide.
    const insider = await o.join('EDITOR', await signUpUser(t, { admin: true, verified: true }));
    const version = detail.body.verification.updatedAt as string;
    await decide(id, { decision: 'APPROVE', expectedUpdatedAt: version }, insider).expect(403);

    await decide(id, { decision: 'REJECT', expectedUpdatedAt: version }).expect(400);
    await decide(id, { decision: 'APPROVE', expectedUpdatedAt: new Date(0).toISOString() }).expect(409);
    const declined = await decide(id, {
      decision: 'REJECT',
      reason: 'The photo is cut off; send the whole certificate.',
      expectedUpdatedAt: version,
    }).expect(200);
    expect(declined.body.verification).toMatchObject({ status: 'REJECTED', hasDocument: false });
    expect(await t.app.get(StorageService).head(documentKey!)).toBeNull();
    for (const manager of [o.owner, o.admin])
      expect(t.mail.lastTo(manager.email)?.text).toContain('The photo is cut off');
    expect(t.mail.lastTo(o.editor.email)?.text ?? '').not.toContain('The photo is cut off');

    const event = await t.prisma.auditEvent.findFirstOrThrow({
      where: { action: 'ORG_VERIFICATION_DECIDED', targetId: id },
    });
    expect(event).toMatchObject({ actorId: reviewer.id, subjectId: o.owner.id });
    expect(event.after).toEqual({ organisationId: o.id, status: 'REJECTED' });
    expect(JSON.stringify(event)).not.toContain('cut off');

    // They can send it again after a decline.
    await submit(o.admin, o.id);
  });

  it('shows a verified badge with the confirmed name once approved', async () => {
    const o = await org();
    expect((await t.http().get(`/organisations/${o.slug}`).expect(200)).body).toMatchObject({
      verified: false,
      verifiedName: null,
    });
    const sent = await submit(o.owner, o.id);
    await decide(sent.body.id, {
      decision: 'APPROVE',
      verifiedName: 'Incorporated Trustees of Grace Assembly Church',
      expectedUpdatedAt: await versionOf(sent.body.id),
    }).expect(200);
    expect(t.mail.lastTo(o.owner.email)?.subject).toBe('Grace Assembly Ibadan is verified');
    expect((await t.http().get(`/organisations/${o.slug}`).expect(200)).body).toMatchObject({
      verified: true,
      verifiedName: 'Incorporated Trustees of Grace Assembly Church',
    });
    expect((await status(o.editor, o.id).expect(200)).body.status).toBe('VERIFIED');
    await upload(o.owner, o.id).expect(409);
  });

  it('sweeps certificate photos uploaded but never sent', async () => {
    const o = await org();
    const doc = await upload(o.owner, o.id).expect(201);
    await t.prisma.identityDocumentUpload.update({
      where: { key: doc.body.documentKey },
      data: { createdAt: new Date(Date.now() - 2 * DAY) },
    });
    await t.app.get(KycRetentionService).sweep();
    expect(await t.app.get(StorageService).head(doc.body.documentKey)).toBeNull();
  });
});
