import { createHmac, randomUUID } from 'node:crypto';
import { BachsProvider } from '../src/payments/adapters/bachs.js';
import type { CheckoutInput } from '../src/payments/payment-provider.js';
import { PaymentEventProcessor } from '../src/webhooks/payment-event.processor.js';
import { createTestApp, signUpUser, type TestApp } from './helpers.js';

// Real checkout + signed webhook settlement, as in campaign-search.e2e.spec.ts.
const signingSecret = 'recently-funded-secret';
const bachs = new BachsProvider('test-api-key', signingSecret);
bachs.createCheckout = async (data: CheckoutInput) => ({
  id: `chk_${data.reference}`,
  reference: data.reference,
  url: `https://checkout.bachs.io/${data.reference}`,
});

/**
 * Donation times are set 30 days ahead, one second apart, so these campaigns
 * are the most recently funded in the shared e2e database: later than any
 * other suite's data, and later than every earlier run of this one (whose
 * "now" was earlier, and whose steps span only seconds).
 */
const STEP = 1000;
const base = Date.now() + 30 * 24 * 60 * 60 * 1000;

describe('recently funded campaigns', () => {
  let t: TestApp;
  let ownerId: string;
  let categoryId: string;

  beforeAll(async () => {
    t = await createTestApp({ paymentProvider: bachs });
    ownerId = (await signUpUser(t)).id;
    categoryId = (await t.prisma.category.findUniqueOrThrow({ where: { slug: 'education' } })).id;
  });
  afterAll(async () => {
    await t.app.close();
  });

  function campaign(title: string, goalAmount: bigint) {
    return t.prisma.campaign.create({
      data: {
        slug: `funded-${randomUUID()}`,
        title,
        ownerId,
        categoryId,
        status: 'ACTIVE',
        currency: 'NGN',
        goalAmount,
        publishedAt: new Date(),
      },
    });
  }

  /** A ₦1,000 donation settled through the webhook pipeline, then dated `at`. */
  async function donate(slug: string, at: number) {
    const res = await t
      .http()
      .post(`/campaigns/${slug}/donations/checkout`)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '100000', email: `${randomUUID()}@example.com` })
      .expect(201);
    const donation = await t.prisma.donation.findUniqueOrThrow({ where: { id: res.body.id } });
    const event = {
      id: `evt_${randomUUID()}`,
      type: 'collection.succeeded',
      created_at: new Date().toISOString(),
      data: {
        charge_id: `ch_${donation.id}`,
        checkout_id: donation.providerCheckoutId,
        reference: donation.reference,
        status: 'SUCCEEDED',
        amount: '1015.00',
        currency: 'NGN',
      },
    };
    const body = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000);
    const digest = createHmac('sha256', signingSecret).update(`${ts}.${body}`).digest('hex');
    await t
      .http()
      .post('/webhooks/bachs')
      .set('Content-Type', 'application/json')
      .set('X-Bachs-Signature-V2', `t=${ts},v1=${digest}`)
      .send(body)
      .expect(202);
    const stored = await t.prisma.paymentEvent.findUniqueOrThrow({
      where: { provider_eventId: { provider: 'bachs', eventId: event.id } },
    });
    await t.app.get(PaymentEventProcessor).process(stored.id);
    await t.prisma.donation.update({ where: { id: donation.id }, data: { succeededAt: new Date(at) } });
  }

  const funded = async (query = '') =>
    (await t.http().get(`/campaigns/recently-funded${query}`).expect(200)).body.items as {
      id: string;
      fundedAt: string;
      raisedAmount: string;
      goalAmount: string;
    }[];

  it('lists live and ended campaigns that reached their goal, most recently funded first', async () => {
    const two = await campaign('Two gifts to goal', 200_000n);
    await donate(two.slug, base + 1 * STEP);
    await donate(two.slug, base + 2 * STEP); // reaches the goal here
    await donate(two.slug, base + 5 * STEP); // past the goal: doesn't move the date
    const one = await campaign('One gift to goal', 100_000n);
    await donate(one.slug, base + 3 * STEP);
    const ended = await campaign('Ended after funding', 100_000n);
    await donate(ended.slug, base + 4 * STEP);
    await t.prisma.campaign.update({ where: { id: ended.id }, data: { status: 'ENDED' } });
    const short = await campaign('Still raising', 500_000n);
    await donate(short.slug, base + 6 * STEP);
    const paused = await campaign('Funded but paused', 100_000n);
    await donate(paused.slug, base + 7 * STEP);
    await t.prisma.campaign.update({ where: { id: paused.id }, data: { status: 'PAUSED' } });

    const items = await funded('?limit=12');
    const ours = items.filter((c) => [two, one, ended, short, paused].some((x) => x.id === c.id));
    // Other suites share this database, so check the order among ours only.
    expect(ours.map((c) => c.id)).toEqual([ended.id, one.id, two.id]);
    const first = ours.find((c) => c.id === two.id)!;
    expect(new Date(first.fundedAt).getTime()).toBe(base + 2 * STEP);
    expect(first).toMatchObject({ raisedAmount: '300000', goalAmount: '200000' });
    expect(first).not.toHaveProperty('ownerId');
  });

  it('dates a gift without a success time by its ledger posting, never null', async () => {
    const undated = await campaign('Funded without a success time', 100_000n);
    await donate(undated.slug, base + 8 * STEP);
    const donation = await t.prisma.donation.findFirstOrThrow({
      where: { campaignId: undated.id },
      include: { ledgerTransaction: true },
    });
    await t.prisma.donation.update({ where: { id: donation.id }, data: { succeededAt: null } });
    const items = await funded('?limit=12');
    expect(items.every((c) => c.fundedAt !== null)).toBe(true);
    const shown = items.find((c) => c.id === undated.id);
    if (shown)
      expect(new Date(shown.fundedAt).getTime()).toBe(donation.ledgerTransaction!.createdAt.getTime());
  });

  it('defaults to six and validates the limit', async () => {
    expect((await funded()).length).toBeLessThanOrEqual(6);
    expect((await funded('?limit=1')).length).toBe(1);
    for (const limit of ['0', '13', 'x'])
      await t.http().get(`/campaigns/recently-funded?limit=${limit}`).expect(400);
  });
});
