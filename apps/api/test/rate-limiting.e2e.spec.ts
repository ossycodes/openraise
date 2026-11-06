import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { relaySignature } from '../src/rate-limit/client-address.js';
import { RateLimitStore } from '../src/rate-limit/rate-limit.store.js';
import { createTestApp, signUpUser, type TestApp } from './helpers.js';
const secret = 'test-relay-secret-'.repeat(3);
const signed = (address: string, path: string, time = String(Date.now())) => ({
  'x-openraise-client-ip': address,
  'x-openraise-relay-time': time,
  'x-openraise-relay-signature': relaySignature(
    secret,
    'POST',
    path,
    address,
    time,
  ),
});
describe('Redis-backed request limits', () => {
  let t: TestApp, config: ConfigService;
  beforeAll(async () => {
    t = await createTestApp({ rateLimiting: true });
    config = t.app.get(ConfigService);
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(() => {
    config.set('RATE_LIMIT_ENABLED', true);
    config.set('RATE_LIMIT_PREFIX', `test-rate-${randomUUID()}`);
    config.set('RATE_LIMIT_RELAY_SECRET', secret);
    config.set('RATE_LIMIT_AUTH_MAX', 2);
    config.set('RATE_LIMIT_UPLOAD_MAX', 1);
    config.set('RATE_LIMIT_REPORT_MAX', 1);
    config.set('RATE_LIMIT_CHECKOUT_MAX', 1);
    config.set('RATE_LIMIT_WINDOW_SECONDS', 60);
    vi.restoreAllMocks();
  });
  it('limits invalid sign-in attempts, including mixed-case routes, and returns Retry-After', async () => {
    for (let i = 0; i < 2; i++)
      await t
        .http()
        .post('/auth/signin')
        .set(signed('192.0.2.1', '/auth/signin'))
        .send({})
        .expect(400);
    const r = await t
      .http()
      .post('/AUTH/SIGNIN/')
      .set(signed('192.0.2.1', '/AUTH/SIGNIN/'))
      .send({})
      .expect(429);
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    expect(r.body.code).toBe('RATE_LIMITED');
    expect(r.headers['cache-control']).toBe('no-store');
  });
  it('keeps signed visitors separate and cannot be bypassed with spoofed forwarding', async () => {
    config.set('RATE_LIMIT_AUTH_MAX', 1);
    await t
      .http()
      .post('/auth/signin')
      .set(signed('192.0.2.1', '/auth/signin'))
      .send({})
      .expect(400);
    await t
      .http()
      .post('/auth/signin')
      .set(signed('192.0.2.2', '/auth/signin'))
      .send({})
      .expect(400);
    await t
      .http()
      .post('/auth/signin')
      .set(signed('192.0.2.1', '/auth/signin'))
      .send({})
      .expect(429);
    await t
      .http()
      .post('/auth/signin')
      .set('X-Forwarded-For', '203.0.113.1')
      .send({})
      .expect(400);
    await t
      .http()
      .post('/auth/signin')
      .set('X-Forwarded-For', '203.0.113.2')
      .set({
        'x-openraise-client-ip': '203.0.113.2',
        'x-openraise-relay-signature': 'a'.repeat(64),
        'x-openraise-relay-time': String(Date.now()),
      })
      .send({})
      .expect(429);
  });
  it('shares IPv6 /64 allowances across temporary addresses', async () => {
    config.set('RATE_LIMIT_AUTH_MAX', 1);
    await t
      .http()
      .post('/auth/signin')
      .set(signed('2001:db8::1', '/auth/signin'))
      .send({})
      .expect(400);
    await t
      .http()
      .post('/auth/signin')
      .set(signed('2001:db8::2', '/auth/signin'))
      .send({})
      .expect(429);
  });
  it('limits verified account identities across visitor networks before KYC submission', async () => {
    const user = await signUpUser(t, { verified: true });
    const token = { Authorization: `Bearer ${user.accessToken}` };
    await t
      .http()
      .post('/kyc')
      .set({ ...signed('192.0.2.1', '/kyc'), ...token })
      .send({})
      .expect(400);
    await t
      .http()
      .post('/kyc')
      .set({ ...signed('192.0.2.2', '/kyc'), ...token })
      .send({})
      .expect(429);
    await t
      .http()
      .post('/kyc/document')
      .set({ ...signed('192.0.2.3', '/kyc/document'), ...token })
      .set('Content-Type', 'image/png')
      .send(Buffer.from('not an image'))
      .expect(429);
    const other = await signUpUser(t, { verified: true });
    await t
      .http()
      .post('/kyc')
      .set({
        ...signed('192.0.2.2', '/kyc'),
        Authorization: `Bearer ${other.accessToken}`,
      })
      .send({})
      .expect(400);
  });
  it('does not reset report and checkout limits by changing campaign slugs or request keys', async () => {
    const report = {
      category: 'OTHER',
      details: 'A detailed concern about this campaign for the administrator.',
    };
    await t
      .http()
      .post('/campaigns/one/reports')
      .set(signed('192.0.2.1', '/campaigns/one/reports'))
      .set('Idempotency-Key', randomUUID())
      .send(report)
      .expect(404);
    await t
      .http()
      .post('/campaigns/two/reports')
      .set(signed('192.0.2.1', '/campaigns/two/reports'))
      .set('Idempotency-Key', randomUUID())
      .send(report)
      .expect(429);
    await t
      .http()
      .post('/campaigns/one/donations/checkout')
      .set(signed('192.0.2.1', '/campaigns/one/donations/checkout'))
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '100000', email: 'donor@example.com' })
      .expect(404);
    await t
      .http()
      .post('/campaigns/two/donations/checkout')
      .set(signed('192.0.2.1', '/campaigns/two/donations/checkout'))
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '100000', email: 'donor@example.com' })
      .expect(429);
  });
  it('fails closed if Redis cannot check a protected write but leaves health and webhooks available', async () => {
    vi.spyOn(t.app.get(RateLimitStore), 'consume').mockRejectedValue(
      new Error('private redis error'),
    );
    const r = await t.http().post('/auth/signin').send({}).expect(503);
    expect(r.body.code).toBe('RATE_LIMIT_UNAVAILABLE');
    expect(r.headers['retry-after']).toBe('5');
    expect(JSON.stringify(r.body)).not.toContain('private redis error');
    await t.http().get('/health').expect(200);
    const hook = await t.http().post('/webhooks/paystack').send({});
    expect(hook.body.code).not.toBe('RATE_LIMIT_UNAVAILABLE');
    expect(hook.status).not.toBe(503);
    const status = await t.http().get('/donations/missing');
    expect(status.status).not.toBe(503);
  });
  it('allows requests again after the actual Redis window expires', async () => {
    config.set('RATE_LIMIT_AUTH_MAX', 1);
    config.set('RATE_LIMIT_WINDOW_SECONDS', 1);
    await t.http().post('/auth/signin').send({}).expect(400);
    await t.http().post('/auth/signin').send({}).expect(429);
    await new Promise((r) => setTimeout(r, 1100));
    await t.http().post('/auth/signin').send({}).expect(400);
  });
  it('enforces atomic shared counters across two API instances under concurrency', async () => {
    const other = await createTestApp({ rateLimiting: true });
    try {
      const otherConfig = other.app.get(ConfigService);
      const prefix = `concurrent-${randomUUID()}`;
      for (const c of [config, otherConfig]) {
        c.set('RATE_LIMIT_PREFIX', prefix);
        c.set('RATE_LIMIT_AUTH_MAX', 3);
        c.set('RATE_LIMIT_RELAY_SECRET', secret);
      }
      await t.app.listen(0, '127.0.0.1');
      await other.app.listen(0, '127.0.0.1');
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          (i % 2 ? t : other)
            .http()
            .post('/auth/signin')
            .set(signed('198.51.100.10', '/auth/signin'))
            .send({}),
        ),
      );
      expect(results.filter((r) => r.status === 400)).toHaveLength(3);
      expect(results.filter((r) => r.status === 429)).toHaveLength(17);
    } finally {
      await other.app.close();
    }
  });
  it('limits the same email target across separate visitor networks', async () => {
    config.set('RATE_LIMIT_AUTH_MAX', 2);
    for (const ip of ['192.0.2.10', '192.0.2.11'])
      await t
        .http()
        .post('/auth/signin')
        .set(signed(ip, '/auth/signin'))
        .send({ email: 'target@example.com' })
        .expect(400);
    await t
      .http()
      .post('/auth/signin')
      .set(signed('192.0.2.12', '/auth/signin'))
      .send({ email: ' TARGET@example.com ' })
      .expect(429);
    await t
      .http()
      .post('/auth/signin')
      .set(signed('192.0.2.12', '/auth/signin'))
      .send({ email: 'someone-else@example.com' })
      .expect(400);
  });
  it('stores hashed identities and expiring keys, not raw emails or addresses', async () => {
    await t
      .http()
      .post('/auth/signin')
      .set(signed('192.0.2.25', '/auth/signin'))
      .send({ email: 'private@example.com' })
      .expect(400);
    const redis = new Redis(config.get<string>('REDIS_URL')!);
    try {
      const keys = await redis.keys(`${config.get('RATE_LIMIT_PREFIX')}:*`);
      expect(keys).toHaveLength(2);
      for (const key of keys) {
        expect(key).not.toContain('192.0.2.25');
        expect(key).not.toContain('private@example.com');
        expect(await redis.pttl(key)).toBeGreaterThan(0);
      }
    } finally {
      redis.disconnect();
    }
  });
});
