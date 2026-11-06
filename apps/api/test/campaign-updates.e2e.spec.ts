import { createHmac, randomUUID, randomInt } from 'node:crypto';
import { PaystackProvider } from '../src/payments/adapters/paystack.js';
import { PaymentEventProcessor } from '../src/webhooks/payment-event.processor.js';
import { UpdateFanout } from '../src/campaign-updates/update-fanout.js';
import { UpdateSubscriptions } from '../src/campaign-updates/update-subscriptions.js';
import { NotificationDeliveryService } from '../src/notifications/notification-delivery.service.js';
import { MailDeliveryError } from '../src/mail/mail.service.js';
import { StorageService } from '../src/storage/storage.service.js';
import {
  createTestApp,
  signUpUser,
  type TestApp,
  type TestUser,
} from './helpers.js';
const secret = 'updates-test-secret';
const provider = new PaystackProvider(secret);
provider.createCheckout = async (input) => ({
  id: input.reference,
  reference: input.reference,
  url: `https://checkout.paystack.com/${input.reference}`,
});
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
describe('campaign updates and opted-in emails', () => {
  let t: TestApp, owner: TestUser, stranger: TestUser, admin: TestUser;
  let id: string, slug: string;
  const campaigns: string[] = [];
  beforeAll(async () => {
    t = await createTestApp({ paymentProvider: provider });
    owner = await signUpUser(t, { verified: true });
    stranger = await signUpUser(t, { verified: true });
    admin = await signUpUser(t, { admin: true });
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    const category = await t.prisma.category.findFirstOrThrow();
    const c = await t.prisma.campaign.create({
      data: {
        slug: `updates-${randomUUID()}`,
        ownerId: owner.id,
        categoryId: category.id,
        title: 'A campaign worth following',
        goalAmount: 100000000n,
        currency: 'NGN',
        status: 'ACTIVE',
      },
    });
    id = c.id;
    slug = c.slug;
    campaigns.push(id);
  });
  afterEach(async () => {
    await t.prisma.campaignUpdate.updateMany({
      where: { campaignId: { in: campaigns } },
      data: { fanoutCompletedAt: new Date() },
    });
    await t.prisma.notificationDelivery.updateMany({
      where: {
        campaignUpdate: { campaignId: { in: campaigns } },
        state: 'PENDING',
      },
      data: { state: 'FAILED', lastError: 'test-complete' },
    });
    vi.restoreAllMocks();
  });
  const as = (user: TestUser) => ({
    Authorization: `Bearer ${user.accessToken}`,
  });
  const content = (patch = {}) => ({
    title: 'A milestone for our community',
    body: 'Thanks to everyone who has helped us take the next step.',
    imageKeys: [],
    ...patch,
  });
  const publish = (patch = {}, key: string = randomUUID(), user = owner) =>
    t
      .http()
      .post(`/campaigns/${id}/updates`)
      .set(as(user))
      .set('Idempotency-Key', key)
      .send(content(patch));
  async function donate(email: string, optIn = false, settle = true) {
    const r = await t
      .http()
      .post(`/campaigns/${slug}/donations/checkout`)
      .set('Idempotency-Key', randomUUID())
      .send({ email, amount: '500000', updatesOptIn: optIn })
      .expect(201);
    const d = await t.prisma.donation.findUniqueOrThrow({
      where: { id: r.body.id },
    });
    if (settle) {
      const data = {
        id: randomInt(1, 2_000_000_000),
        reference: d.reference,
        amount: Number(d.totalCharged),
        currency: d.currency,
        status: 'success',
        paid_at: new Date().toISOString(),
      };
      const raw = JSON.stringify({ event: 'charge.success', data });
      await t
        .http()
        .post('/webhooks/paystack')
        .set('Content-Type', 'application/json')
        .set(
          'X-Paystack-Signature',
          createHmac('sha512', secret).update(raw).digest('hex'),
        )
        .send(raw)
        .expect(202);
      const event = await t.prisma.paymentEvent.findUniqueOrThrow({
        where: {
          provider_eventId: {
            provider: 'paystack',
            eventId: `charge.success:${data.id}`,
          },
        },
      });
      await t.app.get(PaymentEventProcessor).process(event.id);
    }
    return d.id;
  }
  async function fanout(updateId: string) {
    for (let n = 0; n < 20; n++) {
      const row = await t.prisma.campaignUpdate.findUniqueOrThrow({
        where: { id: updateId },
      });
      if (row.fanoutCompletedAt) return;
      await t.app.get(UpdateFanout).nextBatch();
    }
    throw new Error('Fanout did not complete');
  }
  async function send(deliveryId: string) {
    await t.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: { nextAttemptAt: new Date(0) },
    });
    for (let n = 0; n < 50; n++) {
      const row = await t.prisma.notificationDelivery.findUniqueOrThrow({
        where: { id: deliveryId },
      });
      if (row.state !== 'PENDING') return row;
      await t.app.get(NotificationDeliveryService).processNext();
    }
    throw new Error('Delivery did not complete');
  }
  it('publishes once per reviewed request and exposes plain text without private author identifiers', async () => {
    const key = randomUUID();
    const r = await publish(
      {
        title: 'A first milestone',
        body: '<script>alert(1)</script> We have made progress.',
      },
      key,
    ).expect(201);
    expect(
      (
        await publish(
          {
            title: 'A first milestone',
            body: '<script>alert(1)</script> We have made progress.',
          },
          key,
        ).expect(201)
      ).body.id,
    ).toBe(r.body.id);
    await publish({}, key).expect(409);
    const list = await t.http().get(`/campaigns/${slug}/updates`).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].body).toContain('<script>');
    expect(list.body.items[0]).not.toHaveProperty('authorId');
    expect(JSON.stringify(list.body)).not.toContain(owner.email);
    expect(
      await t.prisma.campaignUpdate.count({ where: { campaignId: id } }),
    ).toBe(1);
  });
  it('enforces auth, ownership, verified email, public campaign state and input limits', async () => {
    await t.http().post(`/campaigns/${id}/updates`).send(content()).expect(401);
    await publish({}, randomUUID(), stranger).expect(404);
    for (const patch of [
      { title: 'x' },
      { body: 'short' },
      { body: 'x'.repeat(5001) },
      { imageKeys: ['x', 'x'] },
      { imageKeys: ['a', 'b', 'c', 'd'] },
    ])
      await publish(patch).expect(400);
    await publish({}, 'not-a-uuid').expect(400);
    await t.prisma.campaign.update({
      where: { id },
      data: { status: 'PENDING_REVIEW' },
    });
    await publish().expect(409);
    await t.http().get(`/campaigns/${slug}/updates`).expect(404);
    await t.prisma.campaign.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
    await t.prisma.user.update({
      where: { id: owner.id },
      data: { emailVerifiedAt: null },
    });
    try {
      await publish().expect(403);
    } finally {
      await t.prisma.user.update({
        where: { id: owner.id },
        data: { emailVerifiedAt: new Date() },
      });
    }
  });
  it('validates and freezes uploaded image bytes, independent of a still-writable upload ticket', async () => {
    const ticket = await t
      .http()
      .post(`/campaigns/${id}/updates/images/upload-url`)
      .set(as(owner))
      .send({ contentType: 'image/png', size: png.length })
      .expect(201);
    const slot = ticket.body;
    expect(
      (
        await fetch(slot.uploadUrl, {
          method: 'PUT',
          headers: slot.headers,
          body: png,
        })
      ).ok,
    ).toBe(true);
    const r = await publish({ imageKeys: [slot.key] }).expect(201);
    expect(r.body.images).toHaveLength(1);
    const final = await t.prisma.campaignUpdateImage.findFirstOrThrow({
      where: { updateId: r.body.id },
    });
    await fetch(slot.uploadUrl, {
      method: 'PUT',
      headers: slot.headers,
      body: Buffer.from('<svg>changed</svg>'),
    });
    expect(await t.app.get(StorageService).readStart(final.key, 8)).toEqual(
      new Uint8Array(png.subarray(0, 8)),
    );
    await publish({
      imageKeys: [`campaign-updates/other/uploads/${randomUUID()}.png`],
    }).expect(400);
    const bad = await t
      .http()
      .post(`/campaigns/${id}/updates/images/upload-url`)
      .set(as(owner))
      .send({ contentType: 'image/png', size: 20 })
      .expect(201);
    await fetch(bad.body.uploadUrl, {
      method: 'PUT',
      headers: bad.body.headers,
      body: Buffer.from('<svg>bad content</svg>'),
    });
    await publish({ imageKeys: [bad.body.key] }).expect(400);
  });
  it('creates one subscription only for an explicitly opted-in settled donor and queues one email per update', async () => {
    const email = `sub-${randomUUID()}@example.com`;
    await donate(email, true);
    await donate(email, true);
    await donate(`no-${randomUUID()}@example.com`, false);
    await donate(`pending-${randomUUID()}@example.com`, true, false);
    expect(
      await t.prisma.campaignUpdateSubscription.count({
        where: { campaignId: id },
      }),
    ).toBe(1);
    const r = await publish({
      body: 'A <strong>milestone</strong> worth celebrating.',
    }).expect(201);
    await fanout(r.body.id);
    await t.app.get(UpdateFanout).nextBatch();
    const deliveries = await t.prisma.notificationDelivery.findMany({
      where: { campaignUpdateId: r.body.id },
    });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.recipient).toBe(email);
    expect(deliveries[0]!.html).toContain('&lt;strong&gt;');
    expect(deliveries[0]!.html).not.toContain('<strong>milestone');
    const sent = await send(deliveries[0]!.id);
    expect(sent.state).toBe('SENT');
    expect(
      t.mail.sent.some(
        (m) => m.to === email && m.text.includes('Stop update emails'),
      ),
    ).toBe(true);
  });
  it('requires an explicit unsubscribe POST, cancels queued updates and does not re-subscribe on duplicate settlement', async () => {
    const email = `unsub-${randomUUID()}@example.com`;
    const donationId = await donate(email, true);
    const sub = await t.prisma.campaignUpdateSubscription.findUniqueOrThrow({
      where: { campaignId_email: { campaignId: id, email } },
    });
    const r = await publish().expect(201);
    await fanout(r.body.id);
    const subscriptions = t.app.get(UpdateSubscriptions);
    const token = subscriptions.token(sub.id);
    expect(subscriptions.unsubscribeUrl(sub.id)).toContain('#subscription=');
    expect(subscriptions.unsubscribeUrl(sub.id)).not.toContain(email);
    await t
      .http()
      .get(
        `/campaign-update-subscriptions/${sub.id}/unsubscribe?token=${token}`,
      )
      .expect(404);
    expect(
      (
        await t.prisma.campaignUpdateSubscription.findUniqueOrThrow({
          where: { id: sub.id },
        })
      ).unsubscribedAt,
    ).toBeNull();
    await t
      .http()
      .post(`/campaign-update-subscriptions/${sub.id}/unsubscribe`)
      .send({ token: 'a'.repeat(64) })
      .expect(404);
    await t
      .http()
      .post(`/campaign-update-subscriptions/${sub.id}/unsubscribe`)
      .send({ token })
      .expect(201);
    await t
      .http()
      .post(`/campaign-update-subscriptions/${sub.id}/unsubscribe`)
      .send({ token })
      .expect(201);
    expect(
      (
        await t.prisma.notificationDelivery.findFirstOrThrow({
          where: { campaignUpdateId: r.body.id },
        })
      ).state,
    ).toBe('FAILED');
    await t.prisma.$transaction(async (tx) => {
      const d = await tx.donation.findUniqueOrThrow({
        where: { id: donationId },
      });
      await subscriptions.subscribe(tx, d);
    });
    expect(
      (
        await t.prisma.campaignUpdateSubscription.findUniqueOrThrow({
          where: { id: sub.id },
        })
      ).unsubscribedAt,
    ).not.toBeNull();
  });
  it('allows hiding by owner/admin only and removes public posts and queued email delivery', async () => {
    await donate(`hide-${randomUUID()}@example.com`, true);
    const r = await publish().expect(201);
    await fanout(r.body.id);
    await t
      .http()
      .delete(`/campaign-updates/${r.body.id}`)
      .set(as(stranger))
      .expect(404);
    await t
      .http()
      .delete(`/admin/campaign-updates/${r.body.id}`)
      .set(as(owner))
      .expect(403);
    await t
      .http()
      .delete(`/admin/campaign-updates/${r.body.id}`)
      .set(as(admin))
      .expect(200);
    expect(
      (await t.http().get(`/campaigns/${slug}/updates`).expect(200)).body.items,
    ).toEqual([]);
    const mine = await t
      .http()
      .get(`/campaigns/${id}/updates/mine`)
      .set(as(owner))
      .expect(200);
    expect(mine.body.items[0].hiddenAt).toEqual(expect.any(String));
    expect(
      (
        await t.prisma.notificationDelivery.findFirstOrThrow({
          where: { campaignUpdateId: r.body.id },
        })
      ).state,
    ).toBe('FAILED');
  });
  it('checks current consent again before sending, even when an email is already queued', async () => {
    const email = `consent-${randomUUID()}@example.com`;
    await donate(email, true);
    const r = await publish().expect(201);
    await fanout(r.body.id);
    const delivery = await t.prisma.notificationDelivery.findFirstOrThrow({
      where: { campaignUpdateId: r.body.id },
    });
    await t.prisma.campaignUpdateSubscription.update({
      where: { id: delivery.updateSubscriptionId! },
      data: { unsubscribedAt: new Date() },
    });
    expect((await send(delivery.id)).state).toBe('FAILED');
    expect(
      t.mail.sent.some(
        (m) => m.to === email && m.text.includes('Stop update emails'),
      ),
    ).toBe(false);
  });
  it('retains ambiguous SMTP outcomes without automatically resending update emails', async () => {
    await donate(`uncertain-${randomUUID()}@example.com`, true);
    const r = await publish().expect(201);
    await fanout(r.body.id);
    const delivery = await t.prisma.notificationDelivery.findFirstOrThrow({
      where: { campaignUpdateId: r.body.id },
    });
    const spy = vi
      .spyOn(t.mail, 'send')
      .mockRejectedValueOnce(new MailDeliveryError(true, false));
    expect((await send(delivery.id)).state).toBe('UNCERTAIN');
    await t.app.get(UpdateFanout).nextBatch();
    expect(
      (
        await t.prisma.notificationDelivery.findUniqueOrThrow({
          where: { id: delivery.id },
        })
      ).state,
    ).toBe('UNCERTAIN');
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('resumes fan-out in bounded batches and excludes subscriptions created after publication', async () => {
    const donationId = await donate(`batch-${randomUUID()}@example.com`, true);
    await t.prisma.campaignUpdateSubscription.createMany({
      data: Array.from({ length: 100 }, (_, index) => ({
        campaignId: id,
        donationId,
        email: `batch-${index}-${randomUUID()}@example.com`,
      })),
    });
    const post = await publish().expect(201);
    await t.prisma.campaignUpdateSubscription.create({
      data: {
        campaignId: id,
        donationId,
        email: `late-${randomUUID()}@example.com`,
        createdAt: new Date(Date.now() + 1000),
        consentedAt: new Date(0),
      },
    });
    const work = t.app.get(UpdateFanout);
    await work.nextBatch();
    expect(
      await t.prisma.notificationDelivery.count({
        where: { campaignUpdateId: post.body.id },
      }),
    ).toBe(100);
    expect(
      (
        await t.prisma.campaignUpdate.findUniqueOrThrow({
          where: { id: post.body.id },
        })
      ).fanoutCompletedAt,
    ).toBeNull();
    await work.nextBatch();
    expect(
      await t.prisma.notificationDelivery.count({
        where: { campaignUpdateId: post.body.id },
      }),
    ).toBe(101);
    expect(
      (
        await t.prisma.campaignUpdate.findUniqueOrThrow({
          where: { id: post.body.id },
        })
      ).fanoutCompletedAt,
    ).not.toBeNull();
    await work.nextBatch();
    expect(
      await t.prisma.notificationDelivery.count({
        where: { campaignUpdateId: post.body.id },
      }),
    ).toBe(101);
  });
  it('paginates updates and validates the page without exposing removed updates publicly', async () => {
    for (let i = 0; i < 11; i++)
      await publish({ title: `Progress update ${i + 1}` }).expect(201);
    const first = await t.http().get(`/campaigns/${slug}/updates`).expect(200);
    expect(first.body.items).toHaveLength(10);
    expect(first.body.hasMore).toBe(true);
    const last = await t
      .http()
      .get(`/campaigns/${slug}/updates?page=2`)
      .expect(200);
    expect(last.body.items).toHaveLength(1);
    await t.http().get(`/campaigns/${slug}/updates?page=0`).expect(400);
  });
});
