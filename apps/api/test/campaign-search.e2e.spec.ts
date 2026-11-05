import { createHmac, randomUUID } from 'node:crypto';
import { BachsProvider } from '../src/payments/adapters/bachs.js';
import type { CheckoutInput } from '../src/payments/payment-provider.js';
import { PaymentEventProcessor } from '../src/webhooks/payment-event.processor.js';
import { createTestApp, signUpUser, type TestApp } from './helpers.js';

// Real checkout + signed webhook settlement, as in webhooks.e2e.spec.ts.
const signingSecret = 'test-webhook-secret';
const bachs = new BachsProvider('test-api-key', signingSecret);
bachs.createCheckout = async (data: CheckoutInput) => ({
  id: `chk_${data.reference}`,
  reference: data.reference,
  url: `https://checkout.bachs.io/${data.reference}`,
});

/** A word unique to this run, so other tests' campaigns never match. */
const tag = `zq${randomUUID().replace(/[^a-z]/g, '').slice(0, 10)}`;
/** Publish times count up from now, so "newest" is newest across the whole e2e database. */
const startedAt = Date.now();

describe('campaign search and sorting', () => {
  let t: TestApp;
  let ownerId: string;
  let categoryId: string;
  let minutes = 0;

  beforeAll(async () => {
    t = await createTestApp({ paymentProvider: bachs });
    ownerId = (await signUpUser(t)).id;
    categoryId = (await t.prisma.category.findUniqueOrThrow({ where: { slug: 'education' } })).id;
  });

  afterAll(async () => {
    await t.app.close();
  });

  /** Active campaigns published one minute apart, newest last. */
  async function campaign(fields: { title: string; story?: string; location?: string; goal?: bigint }) {
    minutes += 1;
    return t.prisma.campaign.create({
      data: {
        slug: `search-${randomUUID()}`,
        title: fields.title,
        story: fields.story ?? '',
        location: fields.location ?? null,
        ownerId,
        categoryId,
        status: 'ACTIVE',
        currency: 'NGN',
        goalAmount: fields.goal ?? 100_000_000n,
        publishedAt: new Date(startedAt + minutes * 60_000),
      },
    });
  }

  /** A ₦1,000 donation, settled through the real webhook pipeline. */
  async function donate(slug: string) {
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
  }

  const ids = async (query: string) =>
    ((await t.http().get(`/campaigns?limit=50&${query}`).expect(200)).body.items as { id: string }[]).map(
      (c) => c.id,
    );

  it('finds campaigns by title, story (stemmed) and location, best match first', async () => {
    const inStory = await campaign({ title: 'Help the village', story: `New ${tag} schools for Ikot children` });
    const inTitle = await campaign({ title: `The ${tag} school roof`, story: 'Rain gets in.' });
    const inPlace = await campaign({ title: 'A clinic', location: `${tag}ville` });
    const elsewhere = await campaign({ title: 'Something unrelated' });

    const found = await ids(`q=${tag}%20school`);
    expect(found).toEqual([inTitle.id, inStory.id]);
    expect(await ids(`q=${tag}ville`)).toEqual([inPlace.id]);
    expect(found).not.toContain(elsewhere.id);

    const res = await t.http().get(`/campaigns?q=${tag}%20school`).expect(200);
    expect(res.body.total).toBe(2);
  });

  it('accepts what people actually type and ignores empty searches', async () => {
    await campaign({ title: `Borehole for ${tag} town` });
    // Quotes, a minus and a stray bracket: websearch syntax, never a 500.
    expect(await ids(`q=${encodeURIComponent(`"${tag}" borehole -nothing (`)}`)).toHaveLength(1);
    await t.http().get('/campaigns?q=').expect(200);
    await t.http().get('/campaigns?sort=popular').expect(400);
  });

  it('combines search with the category filter', async () => {
    await campaign({ title: `${tag} football kits` });
    expect(await ids(`q=${tag}%20football&category=education`)).toHaveLength(1);
    expect(await ids(`q=${tag}%20football&category=medical`)).toEqual([]);
  });

  it('sorts by close to goal and trending, using confirmed donations only', async () => {
    const half = await campaign({ title: `${tag} sort half`, goal: 200_000n }); // 1 of 2 → 50%
    const tenth = await campaign({ title: `${tag} sort tenth`, goal: 1_000_000n }); // 2 of 10 → 20%
    const none = await campaign({ title: `${tag} sort none`, goal: 1_000_000n }); // 0%
    const done = await campaign({ title: `${tag} sort done`, goal: 100_000n }); // reached
    await donate(half.slug);
    await donate(tenth.slug);
    await donate(tenth.slug);
    await donate(done.slug);

    const close = await ids(`q=${tag}%20sort&sort=close-to-goal`);
    expect(close).toEqual([half.id, tenth.id, none.id, done.id]);

    const trending = await ids(`q=${tag}%20sort&sort=trending`);
    expect(trending[0]).toBe(tenth.id);
    expect(trending.at(-1)).toBe(none.id);
  });

  it('keeps newest as the default without a search', async () => {
    const latest = await campaign({ title: `${tag} newest check` });
    const page = await t.http().get('/campaigns?limit=50&category=education').expect(200);
    expect(page.body.items[0].id).toBe(latest.id);
  });
});
