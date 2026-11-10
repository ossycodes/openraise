import { createTestApp, signUpUser, type TestApp, type TestUser } from './helpers.js';

describe('organisations', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });

  const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.accessToken}` });
  const verified = () => signUpUser(t, { verified: true });
  const create = (u: TestUser, body: object = { name: 'Hope Foundation Lagos' }) =>
    t.http().post('/organisations').set(auth(u)).send(body);
  const manage = (u: TestUser, id: string) =>
    t.http().get(`/organisations/${id}/manage`).set(auth(u));
  const invite = (u: TestUser, id: string, email: string, role = 'EDITOR') =>
    t.http().post(`/organisations/${id}/invites`).set(auth(u)).send({ email, role });
  /** The token from the last invitation emailed to `email`. */
  const tokenFor = (email: string) => {
    const text = t.mail.lastTo(email)?.text ?? '';
    return new URL(text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;
  };
  const accept = (u: TestUser, token: string) =>
    t.http().post('/organisation-invites/accept').set(auth(u)).send({ token });
  /** An organisation with `owner` plus a member of each listed role. */
  async function team(roles: string[] = []) {
    const owner = await verified();
    const org = (await create(owner).expect(201)).body.organisation as { id: string; slug: string };
    const members: TestUser[] = [];
    for (const role of roles) {
      const m = await verified();
      await invite(owner, org.id, m.email, role).expect(201);
      await accept(m, tokenFor(m.email)).expect(200);
      members.push(m);
    }
    const memberIds = async () =>
      Object.fromEntries(
        ((await manage(owner, org.id).expect(200)).body.members as { userId: string; id: string }[]).map(
          (m) => [m.userId, m.id],
        ),
      ) as Record<string, string>;
    return { owner, org, members, memberIds };
  }

  it('lets a verified person create one, as its owner, with a public profile', async () => {
    await t.http().post('/organisations').send({ name: 'No sign in' }).expect(401);
    const unverified = await signUpUser(t);
    await create(unverified).expect(403);
    const owner = await verified();
    for (const body of [{ name: 'x' }, { name: 'Valid name', website: 'not a url' }, { name: 'Ok', extra: 1 }])
      await create(owner, body).expect(400);

    const res = await create(owner, {
      name: 'Hope Foundation Lagos',
      about: 'Feeding programmes in Ajegunle.',
      website: 'https://hope.example.org',
      location: 'Lagos',
    }).expect(201);
    expect(res.body).toMatchObject({
      myRole: 'OWNER',
      organisation: { name: 'Hope Foundation Lagos', location: 'Lagos' },
      members: [{ userId: owner.id, role: 'OWNER', you: true }],
      invites: [],
    });
    const { id, slug } = res.body.organisation;
    expect(slug).toMatch(/^hope-foundation-lagos-[a-z2-9]{5}$/);

    const profile = await t.http().get(`/organisations/${slug}`).expect(200);
    expect(profile.body).toMatchObject({ name: 'Hope Foundation Lagos', website: 'https://hope.example.org' });
    expect(JSON.stringify(profile.body)).not.toContain(owner.email);
    expect(profile.body).not.toHaveProperty('id');
    await t.http().get('/organisations/no-such-org-zzzzz').expect(404);

    expect((await t.http().get('/organisations/mine').set(auth(owner)).expect(200)).body).toEqual([
      { id, slug, name: 'Hope Foundation Lagos', role: 'OWNER' },
    ]);
    const stranger = await verified();
    await manage(stranger, id).expect(404);
    await t.http().patch(`/organisations/${id}`).set(auth(stranger)).send({ name: 'Taken' }).expect(404);

    const event = await t.prisma.auditEvent.findFirstOrThrow({
      where: { action: 'ORG_MEMBER_ADDED', subjectId: owner.id },
    });
    expect(event).toMatchObject({ actorId: owner.id, targetType: 'OrganisationMember' });
    expect(event.after).toEqual({ organisationId: id, role: 'OWNER' });
  });

  it('invites by email; only that address can accept, once', async () => {
    const { owner, org } = await team();
    const invited = await verified();
    const res = await invite(owner, org.id, invited.email.toUpperCase()).expect(201);
    expect(res.body).toMatchObject({ email: invited.email, role: 'EDITOR', emailSent: true });
    expect(t.mail.lastTo(invited.email)?.subject).toContain('Join Hope Foundation Lagos');
    const first = tokenFor(invited.email);

    // Sending again replaces the open invitation.
    await invite(owner, org.id, invited.email, 'FINANCE').expect(201);
    const second = tokenFor(invited.email);
    expect(second).not.toBe(first);
    expect((await manage(owner, org.id).expect(200)).body.invites).toHaveLength(1);

    const preview = await t.http().post('/organisation-invites/preview').send({ token: second }).expect(200);
    expect(preview.body).toMatchObject({
      organisation: { name: 'Hope Foundation Lagos', slug: org.slug },
      role: 'FINANCE',
      email: invited.email,
      status: 'OPEN',
    });
    expect((await t.http().post('/organisation-invites/preview').send({ token: first }).expect(200)).body.status).toBe(
      'REVOKED',
    );
    await t.http().post('/organisation-invites/preview').send({ token: 'x'.repeat(40) }).expect(404);

    await accept(invited, first).expect(400);
    const someoneElse = await verified();
    await accept(someoneElse, second).expect(403);
    await t.http().post('/organisation-invites/accept').send({ token: second }).expect(401);

    expect((await accept(invited, second).expect(200)).body).toEqual({ id: org.id, slug: org.slug });
    await accept(invited, second).expect(400);
    const view = await manage(invited, org.id).expect(200);
    expect(view.body).toMatchObject({ myRole: 'FINANCE', invites: null });
    expect(view.body.members).toHaveLength(2);

    await invite(owner, org.id, invited.email).expect(409);
  });

  it('lets owners and admins revoke invitations', async () => {
    const { owner, org } = await team();
    const res = await invite(owner, org.id, 'not-yet-signed-up@example.com').expect(201);
    await t.http().delete(`/organisations/${org.id}/invites/${res.body.id}`).set(auth(owner)).expect(204);
    await t.http().delete(`/organisations/${org.id}/invites/${res.body.id}`).set(auth(owner)).expect(404);
    expect((await manage(owner, org.id).expect(200)).body.invites).toEqual([]);
  });

  it('keeps owners in charge of owners, and editors out of team changes', async () => {
    const { owner, org, members, memberIds } = await team(['ADMIN', 'EDITOR']);
    const [admin, editor] = members as [TestUser, TestUser];
    const ids = await memberIds();

    await invite(editor, org.id, 'someone@example.com').expect(403);
    await t.http().patch(`/organisations/${org.id}`).set(auth(editor)).send({ about: 'x' }).expect(403);
    await invite(admin, org.id, 'new-owner@example.com', 'OWNER').expect(403);
    await t
      .http()
      .patch(`/organisations/${org.id}/members/${ids[owner.id]}`)
      .set(auth(admin))
      .send({ role: 'EDITOR' })
      .expect(403);
    await t.http().delete(`/organisations/${org.id}/members/${ids[owner.id]}`).set(auth(admin)).expect(403);
    await t.http().delete(`/organisations/${org.id}/members/${ids[admin.id]}`).set(auth(editor)).expect(403);

    // Admins do run the team below owner.
    await t
      .http()
      .patch(`/organisations/${org.id}`)
      .set(auth(admin))
      .send({ about: 'Updated by an admin', website: null })
      .expect(200);
    const promoted = await t
      .http()
      .patch(`/organisations/${org.id}/members/${ids[editor.id]}`)
      .set(auth(admin))
      .send({ role: 'FINANCE' })
      .expect(200);
    expect(promoted.body.members.find((m: { userId: string }) => m.userId === editor.id).role).toBe('FINANCE');

    const event = await t.prisma.auditEvent.findFirstOrThrow({
      where: { action: 'ORG_ROLE_CHANGED', targetId: ids[editor.id] },
    });
    expect(event).toMatchObject({ actorId: admin.id, subjectId: editor.id });
    expect(event.before).toMatchObject({ role: 'EDITOR' });
    expect(event.after).toMatchObject({ role: 'FINANCE' });
  });

  it('never leaves an organisation without an owner', async () => {
    const { owner, org, members, memberIds } = await team(['EDITOR']);
    const ids = await memberIds();
    const ownerId = ids[owner.id]!;
    await t
      .http()
      .patch(`/organisations/${org.id}/members/${ownerId}`)
      .set(auth(owner))
      .send({ role: 'ADMIN' })
      .expect(409);
    await t.http().delete(`/organisations/${org.id}/members/${ownerId}`).set(auth(owner)).expect(409);

    // A member can always leave.
    const editor = members[0]!;
    await t.http().delete(`/organisations/${org.id}/members/${ids[editor.id]}`).set(auth(editor)).expect(204);
    await manage(editor, org.id).expect(404);
    const removed = await t.prisma.auditEvent.findFirstOrThrow({
      where: { action: 'ORG_MEMBER_REMOVED', targetId: ids[editor.id] },
    });
    expect(removed).toMatchObject({ actorId: editor.id, subjectId: editor.id, after: null });
  });

  it('keeps one owner when two owners demote each other at the same moment', async () => {
    const { owner, org, members, memberIds } = await team(['OWNER']);
    const other = members[0]!;
    const ids = await memberIds();
    const results = await Promise.all([
      t
        .http()
        .patch(`/organisations/${org.id}/members/${ids[other.id]}`)
        .set(auth(owner))
        .send({ role: 'ADMIN' }),
      t
        .http()
        .patch(`/organisations/${org.id}/members/${ids[owner.id]}`)
        .set(auth(other))
        .send({ role: 'ADMIN' }),
    ]);
    // The loser waits on the organisation's row lock, then finds it was
    // demoted itself, so it may no longer change owners at all (403).
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(200);
    expect([403, 409]).toContain(statuses[1]);
    expect(
      await t.prisma.organisationMember.count({ where: { organisationId: org.id, role: 'OWNER' } }),
    ).toBe(1);
  });

  it('caps how many organisations one person can own', async () => {
    const owner = await verified();
    for (let i = 0; i < 5; i++) await create(owner, { name: `Group number ${i}` }).expect(201);
    await create(owner, { name: 'One too many' }).expect(409);
  });
});
