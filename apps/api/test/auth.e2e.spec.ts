import { createTestApp, uniqueEmail, type TestApp } from './helpers.js';

const PASSWORD = 'a long enough password';

describe('auth', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  async function signUp(email = uniqueEmail(), password = PASSWORD) {
    const res = await t
      .http()
      .post('/auth/signup')
      .send({ name: 'Ada Obi', email, password })
      .expect(201);
    return { email, ...(res.body as { accessToken: string; refreshToken: string }) };
  }

  describe('sign up', () => {
    it('creates an unverified user, returns tokens and emails a confirm link', async () => {
      const email = uniqueEmail();
      const res = await t
        .http()
        .post('/auth/signup')
        .send({ name: '  Ada Obi ', email: `  ${email.toUpperCase()} `, password: PASSWORD })
        .expect(201);

      expect(res.body.user).toMatchObject({
        email,
        name: 'Ada Obi',
        role: 'USER',
        emailVerified: false,
      });
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body.expiresIn).toBe(900);
      expect(t.mail.lastTo(email)?.subject).toBe('Confirm your email');

      await t
        .http()
        .get('/users/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200)
        .expect((r) => expect(r.body.email).toBe(email));
    });

    it('rejects a second account with the same email, in any case', async () => {
      const { email } = await signUp();
      await t
        .http()
        .post('/auth/signup')
        .send({ name: 'Other', email: email.toUpperCase(), password: PASSWORD })
        .expect(409);
    });

    it('explains validation errors', async () => {
      const res = await t
        .http()
        .post('/auth/signup')
        .send({ name: '', email: 'not-an-email', password: 'short' })
        .expect(400);
      const paths = (res.body.errors as { path: string }[]).map((e) => e.path);
      expect(paths).toEqual(expect.arrayContaining(['name', 'email', 'password']));
    });
  });

  describe('sign in', () => {
    it('works with the right password', async () => {
      const { email } = await signUp();
      const res = await t
        .http()
        .post('/auth/signin')
        .send({ email, password: PASSWORD })
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('gives the same answer for a wrong password and an unknown email', async () => {
      const { email } = await signUp();
      const wrong = await t
        .http()
        .post('/auth/signin')
        .send({ email, password: 'wrong password!!' })
        .expect(401);
      const unknown = await t
        .http()
        .post('/auth/signin')
        .send({ email: uniqueEmail(), password: PASSWORD })
        .expect(401);
      expect(wrong.body.message).toBe(unknown.body.message);
    });
  });

  describe('refresh tokens', () => {
    it('rotate on every use', async () => {
      const { refreshToken } = await signUp();
      const res = await t
        .http()
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);
      expect(res.body.refreshToken).not.toBe(refreshToken);
    });

    it('revoke the whole sign-in when a spent token is replayed', async () => {
      const { refreshToken: first } = await signUp();
      const rotated = await t.http().post('/auth/refresh').send({ refreshToken: first }).expect(200);
      const second = rotated.body.refreshToken as string;

      // Replaying the spent token: refused, and the newer token dies with it.
      await t.http().post('/auth/refresh').send({ refreshToken: first }).expect(401);
      await t.http().post('/auth/refresh').send({ refreshToken: second }).expect(401);
    });

    it('stop working after sign out', async () => {
      const { refreshToken } = await signUp();
      await t.http().post('/auth/signout').send({ refreshToken }).expect(204);
      await t.http().post('/auth/refresh').send({ refreshToken }).expect(401);
    });

    it('are refused when unknown', async () => {
      await t.http().post('/auth/refresh').send({ refreshToken: 'nope' }).expect(401);
    });
  });

  describe('email verification', () => {
    it('verifies with the emailed link, once', async () => {
      const { email, accessToken } = await signUp();
      const token = t.mail.tokenFor(email);

      await t.http().post('/auth/verify-email').send({ token }).expect(204);
      await t
        .http()
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect((r) => expect(r.body.emailVerified).toBe(true));

      await t.http().post('/auth/verify-email').send({ token }).expect(400);
    });

    it('resending replaces the old link', async () => {
      const { email, accessToken } = await signUp();
      const oldToken = t.mail.tokenFor(email);
      await t
        .http()
        .post('/auth/verify-email/resend')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(202);
      const newToken = t.mail.tokenFor(email);

      expect(newToken).not.toBe(oldToken);
      await t.http().post('/auth/verify-email').send({ token: oldToken }).expect(400);
      await t.http().post('/auth/verify-email').send({ token: newToken }).expect(204);
    });
  });

  describe('password reset', () => {
    it('answers 202 for unknown emails without sending anything', async () => {
      const email = uniqueEmail();
      await t.http().post('/auth/password/forgot').send({ email }).expect(202);
      expect(t.mail.lastTo(email)).toBeUndefined();
    });

    it('sets a new password and signs out every device', async () => {
      const { email, accessToken, refreshToken } = await signUp();
      await t.http().post('/auth/password/forgot').send({ email }).expect(202);
      // The reset email is sent without awaiting; give it a tick.
      await new Promise((r) => setImmediate(r));
      const token = t.mail.tokenFor(email);

      const newPassword = 'a brand new password';
      await t
        .http()
        .post('/auth/password/reset')
        .send({ token, password: newPassword })
        .expect(204);

      // Old password, old access token and old refresh token all stop working.
      await t.http().post('/auth/signin').send({ email, password: PASSWORD }).expect(401);
      await t.http().get('/users/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
      await t.http().post('/auth/refresh').send({ refreshToken }).expect(401);

      const res = await t
        .http()
        .post('/auth/signin')
        .send({ email, password: newPassword })
        .expect(200);
      expect(res.body.user.emailVerified).toBe(true);

      // The link is single use.
      await t
        .http()
        .post('/auth/password/reset')
        .send({ token, password: 'yet another password' })
        .expect(400);
    });

    it('does not accept a verify-email token', async () => {
      const { email } = await signUp();
      const token = t.mail.tokenFor(email);
      await t
        .http()
        .post('/auth/password/reset')
        .send({ token, password: 'a brand new password' })
        .expect(400);
    });
  });

  describe('guarded routes', () => {
    it('need a valid bearer token', async () => {
      await t.http().get('/users/me').expect(401);
      await t.http().get('/users/me').set('Authorization', 'Bearer junk').expect(401);
    });
  });
});
