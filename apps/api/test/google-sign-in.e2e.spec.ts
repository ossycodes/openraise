import { randomUUID } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { GOOGLE_JWKS } from '../src/auth/google-id-token.js';
import { createTestApp, signUpUser, type TestApp } from './helpers.js';

/** Set in vitest.config.e2e.ts, before the app's config is loaded. */
const CLIENT_ID = 'test-client.apps.googleusercontent.com';

describe('Google sign-in', () => {
  let t: TestApp;
  let googleKey: CryptoKey;
  let strangerKey: CryptoKey;

  beforeAll(async () => {
    const google = await generateKeyPair('RS256');
    const stranger = await generateKeyPair('RS256');
    googleKey = google.privateKey;
    strangerKey = stranger.privateKey;
    const jwk = { ...(await exportJWK(google.publicKey)), kid: 'g1', alg: 'RS256', use: 'sig' };
    t = await createTestApp({
      overrides: [{ provide: GOOGLE_JWKS, useValue: createLocalJWKSet({ keys: [jwk] }) }],
    });
  });

  afterAll(async () => {
    await t.app.close();
  });

  /** A Google-shaped ID token; override claims or the key to test rejections. */
  function idToken(
    claims: Record<string, unknown> = {},
    opts: { key?: CryptoKey; aud?: string; exp?: string | number; iss?: string } = {},
  ) {
    return new SignJWT({ email_verified: true, name: 'Ada Obi', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'g1' })
      .setIssuer(opts.iss ?? 'https://accounts.google.com')
      .setAudience(opts.aud ?? CLIENT_ID)
      .setSubject((claims.sub as string) ?? `g-${randomUUID()}`)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '5m')
      .sign(opts.key ?? googleKey);
  }

  const google = (credential: string) =>
    t.http().post('/auth/google').send({ credential });

  it('creates a verified user on first sign-in and returns the same user after', async () => {
    const email = `g-${randomUUID()}@gmail.com`;
    const sub = `g-${randomUUID()}`;
    const first = await google(await idToken({ sub, email: email.toUpperCase() })).expect(200);
    expect(first.body.user).toMatchObject({ email, name: 'Ada Obi', emailVerified: true });

    await t
      .http()
      .get('/users/me')
      .set('Authorization', `Bearer ${first.body.accessToken}`)
      .expect(200);

    const again = await google(await idToken({ sub, email })).expect(200);
    expect(again.body.user.id).toBe(first.body.user.id);
    expect(again.body.refreshToken).not.toBe(first.body.refreshToken);
  });

  it('links an existing password account with the same email', async () => {
    const existing = await signUpUser(t);
    const res = await google(await idToken({ email: existing.email })).expect(200);
    expect(res.body.user).toMatchObject({ id: existing.id, emailVerified: true });
  });

  it('refuses a second Google account for an already linked email', async () => {
    const email = `g-${randomUUID()}@gmail.com`;
    await google(await idToken({ email })).expect(200);
    await google(await idToken({ email })).expect(409);
  });

  it('rejects tokens for another app, expired, unverified, wrongly signed or from another issuer', async () => {
    const email = `g-${randomUUID()}@gmail.com`;
    await google(await idToken({ email }, { aud: 'someone-else.apps.googleusercontent.com' })).expect(401);
    await google(await idToken({ email }, { exp: Math.floor(Date.now() / 1000) - 60 })).expect(401);
    await google(await idToken({ email, email_verified: false })).expect(401);
    await google(await idToken({ email }, { key: strangerKey })).expect(401);
    await google(await idToken({ email }, { iss: 'https://evil.example' })).expect(401);
    await google('not-a-jwt-but-long-enough').expect(401);
    expect(await t.prisma.user.count({ where: { email } })).toBe(0);
  });
});

