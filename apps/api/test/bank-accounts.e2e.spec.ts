import { createTestApp, FakePaymentProvider, signUpUser, type TestApp, type TestUser } from './helpers.js';

describe('bank accounts', () => {
  let t: TestApp;
  let payments: FakePaymentProvider;
  let owner: TestUser;

  beforeAll(async () => {
    payments = new FakePaymentProvider();
    payments.accounts.set('058:0123456789', 'USER TEST ADAEZE');
    payments.accounts.set('044:0987654321', 'TEST USER');
    payments.accounts.set('044:1111111111', 'MUSA BELLO');
    t = await createTestApp({ payments });
    owner = await signUpUser(t, { verified: true });
  });

  afterAll(async () => {
    await t.app.close();
  });

  const as = (u: TestUser) => ({ Authorization: `Bearer ${u.accessToken}` });
  const add = (u: TestUser, bankCode: string, accountNumber: string) =>
    t.http().post('/bank-accounts').set(as(u)).send({ bankCode, accountNumber });

  it('lists banks, sorted by name', async () => {
    const res = await t.http().get('/banks').set(as(owner)).expect(200);
    expect(res.body).toEqual([
      { code: '044', name: 'Access Bank' },
      { code: '058', name: 'GTBank' },
    ]);
    await t.http().get('/banks').expect(401);
  });

  it('previews the account name before saving', async () => {
    await t
      .http()
      .post('/bank-accounts/resolve')
      .set(as(owner))
      .send({ bankCode: '058', accountNumber: '0123456789' })
      .expect(200, {
        bankCode: '058',
        bankName: 'GTBank',
        accountName: 'USER TEST ADAEZE',
        maskedAccountNumber: '******6789',
      });
  });

  it('adds an account: resolved name, masked number, 24-hour hold, owner emailed', async () => {
    const user = await signUpUser(t, { verified: true });
    const before = Date.now();
    const res = await add(user, '058', '0123456789').expect(201);

    expect(res.body).toMatchObject({
      bankName: 'GTBank',
      accountName: 'USER TEST ADAEZE',
      maskedAccountNumber: '******6789',
      isDefault: true,
      recipientUsable: true,
      nameMatchesProfile: true,
    });
    expect(JSON.stringify(res.body)).not.toContain('0123456789');
    const hold = new Date(res.body.payoutsAvailableAt).getTime() - before;
    expect(hold).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);

    expect(payments.recipients.at(-1)).toMatchObject({
      accountName: 'USER TEST ADAEZE',
      idempotencyKey: `recipient:${user.id}:058:0123456789`,
    });
    await new Promise((r) => setImmediate(r));
    expect(t.mail.lastTo(user.email)?.subject).toBe('A payout account was added');
  });

  it('flags a name that does not match the account holder', async () => {
    const user = await signUpUser(t, { verified: true });
    const res = await add(user, '044', '1111111111').expect(201);
    expect(res.body.nameMatchesProfile).toBe(false);
  });

  it('refuses unknown accounts, unknown banks, bad numbers and duplicates', async () => {
    const user = await signUpUser(t, { verified: true });
    await add(user, '058', '9999999999').expect(400);
    await add(user, '999', '0123456789').expect(400);
    await add(user, '058', '12345').expect(400);
    await add(user, '058', '0123456789').expect(201);
    await add(user, '058', '0123456789').expect(409);
  });

  it('needs a verified email', async () => {
    const unverified = await signUpUser(t);
    await add(unverified, '058', '0123456789').expect(403);
  });

  it('keeps one default; removing it promotes the next', async () => {
    const user = await signUpUser(t, { verified: true });
    const first = (await add(user, '058', '0123456789').expect(201)).body as { id: string };
    const second = (await add(user, '044', '0987654321').expect(201)).body as { id: string; isDefault: boolean };
    expect(second.isDefault).toBe(false);

    const switched = await t.http().put(`/bank-accounts/${second.id}/default`).set(as(user)).expect(200);
    expect((switched.body as { id: string; isDefault: boolean }[]).map((a) => [a.id, a.isDefault])).toEqual([
      [second.id, true],
      [first.id, false],
    ]);

    const afterRemove = await t.http().delete(`/bank-accounts/${second.id}`).set(as(user)).expect(200);
    expect(afterRemove.body).toEqual([expect.objectContaining({ id: first.id, isDefault: true })]);
    // Kept for history, hidden from the list.
    expect(await t.prisma.bankAccount.count({ where: { id: second.id, removedAt: { not: null } } })).toBe(1);
  });

  it('is private to its owner', async () => {
    const user = await signUpUser(t, { verified: true });
    const other = await signUpUser(t, { verified: true });
    const account = (await add(user, '058', '0123456789').expect(201)).body as { id: string };
    await t.http().put(`/bank-accounts/${account.id}/default`).set(as(other)).expect(404);
    await t.http().delete(`/bank-accounts/${account.id}`).set(as(other)).expect(404);
    expect((await t.http().get('/bank-accounts').set(as(other)).expect(200)).body).toEqual([]);
  });

  it('caps a user at 5 accounts', async () => {
    const user = await signUpUser(t, { verified: true });
    for (let i = 0; i < 5; i++) {
      const number = `555000000${i}`;
      payments.accounts.set(`058:${number}`, 'TEST USER');
      await add(user, '058', number).expect(201);
    }
    payments.accounts.set('058:5550000009', 'TEST USER');
    await add(user, '058', '5550000009').expect(409);
  });

  it('answers 502, without provider details, when the provider fails', async () => {
    const user = await signUpUser(t, { verified: true });
    payments.failNext = true;
    const res = await add(user, '058', '0123456789').expect(502);
    expect(res.body.message).toBe('The bank lookup service is unavailable. Try again shortly.');
  });
});

describe('bank accounts on a deployment without payments', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('answers 503', async () => {
    const user = await signUpUser(t, { verified: true });
    await t.http().get('/banks').set({ Authorization: `Bearer ${user.accessToken}` }).expect(503);
  });
});
