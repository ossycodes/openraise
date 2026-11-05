import { randomUUID } from 'node:crypto';
import { BachsProvider } from '../src/payments/adapters/bachs.js';
import { NotificationScheduler } from '../src/notifications/notification-scheduler.js';
import { NotificationDeliveryService } from '../src/notifications/notification-delivery.service.js';
import { NotificationWorker } from '../src/notifications/notification.worker.js';
import { PaymentEventProcessor } from '../src/webhooks/payment-event.processor.js';
import { MailDeliveryError } from '../src/mail/mail.service.js';
import { createTestApp, signUpUser, type TestApp } from './helpers.js';

const provider = new BachsProvider('fake-key', 'fake-signature');
provider.createCheckout = async (input) => ({
  id: `chk_${input.reference}`,
  reference: input.reference,
  url: 'https://checkout.bachs.io/test',
});

describe('donor receipts and creator notifications', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ paymentProvider: provider });
  });
  afterAll(async () => {
    await t.app.close();
  });
  async function campaign() {
    const owner = await signUpUser(t);
    const category = await t.prisma.category.findFirstOrThrow();
    return t.prisma.campaign.create({
      data: {
        title: `Support <Ada> ${randomUUID()}`,
        slug: `receipts-${randomUUID()}`,
        ownerId: owner.id,
        categoryId: category.id,
        goalAmount: 10000000n,
        currency: 'NGN',
        status: 'ACTIVE',
      },
      include: { owner: true },
    });
  }
  async function pending(slug: string) {
    const response = await t
      .http()
      .post(`/campaigns/${slug}/donations/checkout`)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '100000', email: `${randomUUID()}@example.com` })
      .expect(201);
    return t.prisma.donation.findUniqueOrThrow({
      where: { id: response.body.id },
    });
  }
  async function event(
    donation: Awaited<ReturnType<typeof pending>>,
    type = 'payment.succeeded',
  ) {
    return t.prisma.paymentEvent.create({
      data: {
        provider: 'bachs',
        eventId: `evt_${randomUUID()}`,
        rawBody: new Uint8Array(),
        type,
        resourceId: `ch_${donation.id}`,
        reference: donation.reference,
        amount: donation.totalCharged,
        currency: donation.currency,
        occurredAt: new Date(),
      },
    });
  }
  const settle = (id: string) => t.app.get(PaymentEventProcessor).process(id);
  async function deliverAll() {
    while (await t.app.get(NotificationDeliveryService).processNext()) {}
  }
  const receipts = (id: string) =>
    t.prisma.donationNotification.findMany({
      where: { donationId: id },
      include: { delivery: true },
    });

  it('creates no receipt for pending/failed payments and schedules one after verified settlement', async () => {
    const c = await campaign();
    const donation = await pending(c.slug);
    expect(await receipts(donation.id)).toHaveLength(0);
    await settle((await event(donation, 'payment.failed')).id);
    expect(await receipts(donation.id)).toHaveLength(0);
    const success = await event(donation);
    await settle(success.id);
    await settle(success.id);
    await settle((await event(donation)).id);
    const notices = await receipts(donation.id);
    expect(notices).toHaveLength(2);
    const receipt = notices.find(
      (item) => item.kind === 'DONOR_RECEIPT',
    )!.delivery;
    expect(receipt).toMatchObject({
      state: 'PENDING',
      attempts: 0,
      recipient: donation.donorEmail,
    });
    await deliverAll();
    await deliverAll();
    const sent = t.mail.sent.filter((mail) => mail.to === donation.donorEmail);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain('1,015.00');
    expect(sent[0]?.text).toContain(donation.reference);
    expect(sent[0]?.html).toContain('&lt;Ada&gt;');
    expect(sent[0]?.messageId).toBe(`<${receipt.id}@receipts.openraise.local>`);
  });
  it('rolls notification intents back with payment and ledger state on failure', async () => {
    const c = await campaign();
    const donation = await pending(c.slug);
    const payment = await event(donation);
    const scheduler = t.app.get(NotificationScheduler);
    const original = scheduler.schedule.bind(scheduler);
    const spy = vi
      .spyOn(scheduler, 'schedule')
      .mockImplementationOnce(async (...args) => {
        await original(...args);
        throw new Error('Injected scheduling failure');
      });
    try {
      await expect(settle(payment.id)).rejects.toThrow(
        'Injected scheduling failure',
      );
    } finally {
      spy.mockRestore();
    }
    expect(await receipts(donation.id)).toHaveLength(0);
    expect(
      (
        await t.prisma.donation.findUniqueOrThrow({
          where: { id: donation.id },
        })
      ).status,
    ).toBe('PENDING');
    expect(
      await t.prisma.ledgerTransaction.count({
        where: { idempotencyKey: `donation:${donation.id}` },
      }),
    ).toBe(0);
    await settle(payment.id);
    expect(await receipts(donation.id)).toHaveLength(2);
  });
  it('batches creator donations into one frozen message without donor emails', async () => {
    const c = await campaign();
    const scheduler = t.app.get(NotificationScheduler);
    const original = scheduler.schedule.bind(scheduler);
    const fixed = new Date('2026-01-01T12:00:00Z');
    const spy = vi
      .spyOn(scheduler, 'schedule')
      .mockImplementation((tx, donation) => original(tx, donation, fixed));
    const a = await pending(c.slug);
    const b = await pending(c.slug);
    try {
      await settle((await event(a)).id);
      await settle((await event(b)).id);
    } finally {
      spy.mockRestore();
    }
    const notices = await t.prisma.donationNotification.findMany({
      where: { donationId: { in: [a.id, b.id] }, kind: 'CREATOR_DONATIONS' },
    });
    expect(new Set(notices.map((item) => item.deliveryId)).size).toBe(1);
    await deliverAll();
    const mail = t.mail.sent.filter(
      (item) => item.to === c.owner.email && item.subject.includes('donations'),
    );
    expect(mail).toHaveLength(1);
    expect(mail[0]?.text).toContain('2 new donations');
    expect(mail[0]?.text).toContain('2,000.00');
    expect(mail[0]?.text).not.toContain(a.donorEmail);
    expect(mail[0]?.text).not.toContain(b.donorEmail);
  });
  it('retries a confirmed rejection with the same Message-ID and no duplicate accepted email', async () => {
    const c = await campaign();
    const donation = await pending(c.slug);
    await settle((await event(donation)).id);
    await deliverAll(); // Clear earlier pending receipts so the injected failure targets this test's new row below.
    const other = await pending(c.slug);
    await settle((await event(other)).id);
    const receipt = (await receipts(other.id)).find(
      (item) => item.kind === 'DONOR_RECEIPT',
    )!.delivery;
    const original = t.mail.send.bind(t.mail);
    let rejected = false;
    const spy = vi.spyOn(t.mail, 'send').mockImplementation(async (message) => {
      if (message.to === other.donorEmail && !rejected) {
        rejected = true;
        throw new MailDeliveryError(false);
      }
      return original(message);
    });
    try {
      await deliverAll();
    } finally {
      spy.mockRestore();
    }
    expect(
      await t.prisma.notificationDelivery.findUnique({
        where: { id: receipt.id },
      }),
    ).toMatchObject({
      state: 'PENDING',
      attempts: 1,
      lastError: 'temporary-rejection',
    });
    await t.prisma.notificationDelivery.update({
      where: { id: receipt.id },
      data: { nextAttemptAt: new Date(0) },
    });
    await deliverAll();
    await deliverAll();
    expect(
      t.mail.sent.filter((item) => item.to === other.donorEmail),
    ).toHaveLength(1);
    expect(
      await t.prisma.notificationDelivery.findUnique({
        where: { id: receipt.id },
      }),
    ).toMatchObject({ state: 'SENT', attempts: 2 });
  });
  it('holds ambiguous delivery and interrupted sends without retrying automatically', async () => {
    await deliverAll();
    const c = await campaign();
    const donation = await pending(c.slug);
    await settle((await event(donation)).id);
    const receipt = (await receipts(donation.id)).find(
      (item) => item.kind === 'DONOR_RECEIPT',
    )!.delivery;
    const original = t.mail.send.bind(t.mail);
    const spy = vi.spyOn(t.mail, 'send').mockImplementation(async (message) => {
      if (message.to === donation.donorEmail) throw new MailDeliveryError(true);
      return original(message);
    });
    try {
      await deliverAll();
    } finally {
      spy.mockRestore();
    }
    await deliverAll();
    expect(
      await t.prisma.notificationDelivery.findUnique({
        where: { id: receipt.id },
      }),
    ).toMatchObject({ state: 'UNCERTAIN', attempts: 1 });
    expect(
      t.mail.sent.filter((item) => item.to === donation.donorEmail),
    ).toHaveLength(0);
    const interrupted = await pending(c.slug);
    await settle((await event(interrupted)).id);
    const stale = (await receipts(interrupted.id)).find(
      (item) => item.kind === 'DONOR_RECEIPT',
    )!.delivery;
    await t.prisma.notificationDelivery.update({
      where: { id: stale.id },
      data: { state: 'SENDING', attempts: 1, startedAt: new Date(0) },
    });
    await t.app.get(NotificationDeliveryService).recoverInterrupted();
    await deliverAll();
    expect(
      await t.prisma.notificationDelivery.findUnique({
        where: { id: stale.id },
      }),
    ).toMatchObject({ state: 'UNCERTAIN', lastError: 'interrupted-send' });
  });
  it('claims pending deliveries safely across concurrent senders', async () => {
    await deliverAll();
    const c = await campaign();
    const donation = await pending(c.slug);
    await settle((await event(donation)).id);
    const deliveries = t.app.get(NotificationDeliveryService);
    await Promise.all([
      deliveries.processNext(),
      deliveries.processNext(),
      deliveries.processNext(),
    ]);
    expect(
      t.mail.sent.filter((item) => item.to === donation.donorEmail),
    ).toHaveLength(1);
  });
  it('keeps accepted SMTP mail out of retries when recording success fails', async () => {
    await deliverAll();
    const c = await campaign();
    const donation = await pending(c.slug);
    await settle((await event(donation)).id);
    const receipt = (await receipts(donation.id)).find(
      (item) => item.kind === 'DONOR_RECEIPT',
    )!.delivery;
    const original = t.prisma.notificationDelivery.updateMany.bind(
      t.prisma.notificationDelivery,
    );
    const spy = vi
      .spyOn(t.prisma.notificationDelivery, 'updateMany')
      .mockImplementation((args) => {
        if (args?.where?.id === receipt.id && args?.data?.state === 'SENT')
          throw new Error('Lost database after SMTP acceptance');
        return original(args);
      });
    try {
      await expect(deliverAll()).rejects.toThrow(
        'Lost database after SMTP acceptance',
      );
    } finally {
      spy.mockRestore();
    }
    expect(
      (
        await t.prisma.notificationDelivery.findUniqueOrThrow({
          where: { id: receipt.id },
        })
      ).state,
    ).toBe('SENDING');
    await t.prisma.notificationDelivery.update({
      where: { id: receipt.id },
      data: { startedAt: new Date(0) },
    });
    await t.app.get(NotificationDeliveryService).recoverInterrupted();
    await deliverAll();
    expect(
      t.mail.sent.filter((item) => item.to === donation.donorEmail),
    ).toHaveLength(1);
    expect(
      (
        await t.prisma.notificationDelivery.findUniqueOrThrow({
          where: { id: receipt.id },
        })
      ).state,
    ).toBe('UNCERTAIN');
  });
  it('starts a new creator delivery rather than changing a sent digest', async () => {
    const c = await campaign();
    const scheduler = t.app.get(NotificationScheduler);
    const original = scheduler.schedule.bind(scheduler);
    const spy = vi
      .spyOn(scheduler, 'schedule')
      .mockImplementation((tx, donation) =>
        original(tx, donation, new Date('2026-01-01T12:00:00Z')),
      );
    try {
      const a = await pending(c.slug);
      await settle((await event(a)).id);
      await deliverAll();
      const before = (await receipts(a.id)).find(
        (item) => item.kind === 'CREATOR_DONATIONS',
      )!.delivery;
      expect(before.state).toBe('SENT');
      const b = await pending(c.slug);
      await settle((await event(b)).id);
      await deliverAll();
      const after = (await receipts(b.id)).find(
        (item) => item.kind === 'CREATOR_DONATIONS',
      )!.delivery;
      expect(after.id).not.toBe(before.id);
      expect(after.state).toBe('SENT');
      expect(
        (
          await t.prisma.notificationDelivery.findUniqueOrThrow({
            where: { id: before.id },
          })
        ).text,
      ).toBe(before.text);
    } finally {
      spy.mockRestore();
    }
  });
  it('recovers pending receipts after restart through the background worker', async () => {
    await deliverAll();
    const c = await campaign();
    const donation = await pending(c.slug);
    await settle((await event(donation)).id);
    const restarted = await createTestApp({
      paymentProvider: null,
      backgroundJobs: true,
    });
    try {
      await restarted.app.get(NotificationWorker).drain();
      expect(
        restarted.mail.sent.filter((item) => item.to === donation.donorEmail),
      ).toHaveLength(1);
      expect(
        t.mail.sent.filter((item) => item.to === donation.donorEmail),
      ).toHaveLength(0);
    } finally {
      await restarted.app.close();
    }
  });
});
