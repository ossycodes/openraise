import { randomUUID } from 'node:crypto';
import { PaystackProvider } from '../src/payments/adapters/paystack.js';
import type { CheckoutInput } from '../src/payments/payment-provider.js';
import { PaymentProviderError } from '../src/payments/provider-http.js';
import { FeesService } from '../src/fees/fees.service.js';
import {
  createTestApp,
  signUpUser,
  type TestApp,
  type TestUser,
} from './helpers.js';

const provider = new PaystackProvider('test-secret');
const hosted = vi.fn(async (input: CheckoutInput) => ({
  id: input.reference,
  reference: input.reference,
  url: `https://checkout.paystack.com/${input.reference}`,
}));
provider.createCheckout = hosted;
const input = { amount: '100000', email: 'donor@example.com' };

describe('donation checkout', () => {
  let t: TestApp;
  let owner: TestUser;
  let slug: string;
  let campaignId: string;
  beforeAll(async () => {
    t = await createTestApp({ paymentProvider: provider });
    owner = await signUpUser(t, { verified: true });
    const category = await t.prisma.category.findFirstOrThrow();
    const campaign = await t.prisma.campaign.create({
      data: {
        slug: `checkout-${randomUUID()}`,
        title: 'A campaign for checkout',
        ownerId: owner.id,
        categoryId: category.id,
        status: 'ACTIVE',
        currency: 'NGN',
        goalAmount: 100000000n,
      },
    });
    slug = campaign.slug;
    campaignId = campaign.id;
  });
  afterAll(async () => {
    await t.app.close();
  });
  const url = () => `/campaigns/${slug}/donations/checkout`;

  it('quotes exact fees without creating a donation or calling a provider', async () => {
    const count = await t.prisma.donation.count();
    const calls = hosted.mock.calls.length;
    const quote = await t
      .http()
      .post(`/campaigns/${slug}/donations/quote`)
      .send(input)
      .expect(201);
    expect(quote.body).toMatchObject({
      amount: '100000',
      currency: 'NGN',
      platformFee: '3500',
      donorFee: '1500',
      totalCharged: '101500',
      netToCampaign: '96500',
      minimumAmount: '5000',
    });
    const covered = await t
      .http()
      .post(`/campaigns/${slug}/donations/quote`)
      .send({ ...input, donorCoversPlatformFee: true })
      .expect(201);
    expect(covered.body).toMatchObject({
      totalCharged: '105053',
      netToCampaign: '100000',
      donorFee: '1553',
    });
    expect(await t.prisma.donation.count()).toBe(count);
    expect(hosted).toHaveBeenCalledTimes(calls);
  });
  it('creates a pending guest donation and sends only the server-computed total', async () => {
    const response = await t
      .http()
      .post(url())
      .set('Idempotency-Key', randomUUID())
      .send(input)
      .expect(201);
    expect(response.body).toMatchObject({
      status: 'PENDING',
      checkoutState: 'READY',
      totalCharged: '101500',
      checkoutUrl: expect.stringContaining('https://checkout.paystack.com/'),
      statusToken: expect.any(String),
    });
    const stored = await t.prisma.donation.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(stored).toMatchObject({
      donorUserId: null,
      donorEmail: input.email,
      amount: 100000n,
      totalCharged: 101500n,
      status: 'PENDING',
    });
    expect(hosted.mock.calls.at(-1)?.[0]).toMatchObject({
      amount: 101500n,
      currency: 'NGN',
      reference: stored.reference,
      email: input.email,
    });
    expect(hosted.mock.calls.at(-1)?.[0].successUrl).not.toContain(
      response.body.statusToken,
    );
    expect(response.body).not.toHaveProperty('donorEmail');
    await t.http().get(`/donations/${stored.id}`).expect(404);
    await t
      .http()
      .get(`/donations/${stored.id}`)
      .set('X-Donation-Token', 'a'.repeat(64))
      .expect(404);
    await t
      .http()
      .get(`/donations/${stored.id}`)
      .set('X-Donation-Token', response.body.statusToken)
      .expect(200)
      .expect((res) => expect(res.body.status).toBe('PENDING'));
  });
  it('replays a checkout with its original fees even after settings or campaign status change', async () => {
    const key = randomUUID();
    const first = await t
      .http()
      .post(url())
      .set('Idempotency-Key', key)
      .send(input)
      .expect(201);
    const calls = hosted.mock.calls.length;
    const feeConfig = t.app.get(FeesService).config;
    const originalBps = feeConfig.platformFeeBps;
    feeConfig.platformFeeBps = 500;
    await t.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'PAUSED' },
    });
    try {
      const second = await t
        .http()
        .post(url())
        .set('Idempotency-Key', key)
        .send(input)
        .expect(201);
      expect(second.body).toEqual(first.body);
      expect(hosted).toHaveBeenCalledTimes(calls);
      await t
        .http()
        .post(url())
        .set('Idempotency-Key', key)
        .send({ ...input, amount: '200000' })
        .expect(409);
    } finally {
      feeConfig.platformFeeBps = originalBps;
      await t.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'ACTIVE' },
      });
    }
  });
  it('associates authenticated donors with their own account email', async () => {
    const response = await t
      .http()
      .post(url())
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '100000' })
      .expect(201);
    expect(
      await t.prisma.donation.findUniqueOrThrow({
        where: { id: response.body.id },
      }),
    ).toMatchObject({ donorUserId: owner.id, donorEmail: owner.email });
    await t
      .http()
      .post(url())
      .set('Authorization', 'Bearer invalid')
      .set('Idempotency-Key', randomUUID())
      .send(input)
      .expect(401);
  });
  it('validates the key, amount, currency and guest email before calling the provider', async () => {
    const calls = hosted.mock.calls.length;
    for (const patch of [
      { amount: 100000 },
      { amount: '-1' },
      { amount: '1' },
      { amount: '9223372036854775807' },
      { currency: 'USD' },
      { totalCharged: '1' },
      { email: undefined },
    ]) {
      await t
        .http()
        .post(url())
        .set('Idempotency-Key', randomUUID())
        .send({ ...input, ...patch })
        .expect(400);
    }
    await t.http().post(url()).send(input).expect(400);
    await t
      .http()
      .post(url())
      .set('Idempotency-Key', 'guessable')
      .send(input)
      .expect(400);
    expect(hosted).toHaveBeenCalledTimes(calls);
  });
  it('rejects inactive and past-end campaigns', async () => {
    for (const data of [
      { status: 'DRAFT' as const },
      { status: 'PAUSED' as const },
      { status: 'ACTIVE' as const, endsAt: new Date(0) },
    ]) {
      await t.prisma.campaign.update({ where: { id: campaignId }, data });
      await t
        .http()
        .post(url())
        .set('Idempotency-Key', randomUUID())
        .send(input)
        .expect(404);
    }
    await t.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'ACTIVE', endsAt: null },
    });
  });
  it('does not create another hosted checkout during a concurrent retry', async () => {
    const key = randomUUID();
    let release!: () => void;
    let started!: () => void;
    const arrived = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    hosted.mockImplementationOnce(async (data) => {
      started();
      await blocked;
      return {
        id: data.reference,
        reference: data.reference,
        url: 'https://checkout.paystack.com/concurrent',
      };
    });
    const first = t
      .http()
      .post(url())
      .set('Idempotency-Key', key)
      .send(input)
      .then((response) => response);
    await arrived;
    try {
      await t
        .http()
        .post(url())
        .set('Idempotency-Key', key)
        .send(input)
        .expect(409);
    } finally {
      release();
    }
    expect((await first).status).toBe(201);
    expect(
      await t.prisma.donation.count({
        where: {
          idempotencyKeyHash: { not: '' },
          checkoutUrl: 'https://checkout.paystack.com/concurrent',
        },
      }),
    ).toBe(1);
  });
  it('keeps uncertain writes pending and never repeats the provider call for that key', async () => {
    const key = randomUUID();
    hosted.mockRejectedValueOnce(
      new PaymentProviderError('transport-error', undefined, true),
    );
    const first = await t
      .http()
      .post(url())
      .set('Idempotency-Key', key)
      .send(input)
      .expect(503);
    expect(first.body).toMatchObject({
      donationId: expect.any(String),
      statusToken: expect.any(String),
    });
    const calls = hosted.mock.calls.length;
    await t
      .http()
      .post(url())
      .set('Idempotency-Key', key)
      .send(input)
      .expect(503);
    expect(hosted).toHaveBeenCalledTimes(calls);
    const stored = await t.prisma.donation.findUniqueOrThrow({
      where: { id: first.body.donationId },
    });
    expect(stored).toMatchObject({
      status: 'PENDING',
      checkoutState: 'UNCERTAIN',
    });
  });
  it('marks a definite provider rejection failed without counting it as a donation', async () => {
    hosted.mockRejectedValueOnce(
      new PaymentProviderError('http-error', 400, false),
    );
    const response = await t
      .http()
      .post(url())
      .set('Idempotency-Key', randomUUID())
      .send(input)
      .expect(503);
    expect(
      await t.prisma.donation.findUniqueOrThrow({
        where: { id: response.body.donationId },
      }),
    ).toMatchObject({ status: 'FAILED', checkoutState: 'FAILED' });
  });
  it('returns 503 when payments are disabled', async () => {
    const disabled = await createTestApp({ paymentProvider: null });
    try {
      await disabled
        .http()
        .post(url())
        .set('Idempotency-Key', randomUUID())
        .send(input)
        .expect(503);
    } finally {
      await disabled.app.close();
    }
  });
});
