import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { BachsProvider } from '../src/payments/adapters/bachs.js';
import { PaystackProvider } from '../src/payments/adapters/paystack.js';
import { PaymentEventProcessor } from '../src/webhooks/payment-event.processor.js';
import { PaymentEventQueue } from '../src/webhooks/payment-event.queue.js';
import { LedgerService } from '../src/ledger/ledger.service.js';
import type { CheckoutInput } from '../src/payments/payment-provider.js';
import { createTestApp, signUpUser, type TestApp } from './helpers.js';

const apiSecret = 'test-api-key';
const signingSecret = 'test-webhook-secret';
const bachs = new BachsProvider(apiSecret, signingSecret);
const hosted = async (data: CheckoutInput) => ({
  id: `chk_${data.reference}`,
  reference: data.reference,
  url: `https://checkout.bachs.io/${data.reference}`,
});
bachs.createCheckout = hosted;
function signed(event: unknown) {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', signingSecret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return { body, signature: `t=${timestamp},v1=${digest}` };
}

describe('payment webhooks', () => {
  let t: TestApp;
  let slug: string;
  beforeAll(async () => {
    t = await createTestApp({ paymentProvider: bachs });
    const owner = await signUpUser(t);
    const category = await t.prisma.category.findFirstOrThrow();
    const campaign = await t.prisma.campaign.create({
      data: {
        slug: `webhooks-${randomUUID()}`,
        title: 'Webhook campaign',
        ownerId: owner.id,
        categoryId: category.id,
        status: 'ACTIVE',
        currency: 'NGN',
        goalAmount: 100000000n,
      },
    });
    slug = campaign.slug;
  });
  afterAll(async () => {
    await t.app.close();
  });
  async function pending() {
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
  function eventFor(
    donation: Awaited<ReturnType<typeof pending>>,
    patch: Record<string, unknown> = {},
    data: Record<string, unknown> = {},
  ) {
    return {
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
        ...data,
      },
      ...patch,
    };
  }
  async function receive(event: unknown, app = t, expected = 202) {
    const { body, signature } = signed(event);
    await app
      .http()
      .post('/webhooks/bachs')
      .set('Content-Type', 'application/json')
      .set('X-Bachs-Signature-V2', signature)
      .send(body)
      .expect(expected);
    const typed = event as { id: string };
    return app.prisma.paymentEvent.findUniqueOrThrow({
      where: { provider_eventId: { provider: 'bachs', eventId: typed.id } },
    });
  }
  const runEvent = (id: string) => t.app.get(PaymentEventProcessor).process(id);

  it('refuses invalid signatures, raw-byte tampering, inactive providers and unknown paths', async () => {
    const count = await t.prisma.paymentEvent.count();
    const event = eventFor(await pending());
    const { body, signature } = signed(event);
    await t.http().post('/webhooks/bachs').send(event).expect(400);
    await t
      .http()
      .post('/webhooks/bachs')
      .set('Content-Type', 'application/json')
      .set('X-Bachs-Signature-V2', signature)
      .send(`${body} `)
      .expect(400);
    await t.http().post('/webhooks/paystack').send(event).expect(404);
    await t.http().post('/webhooks/not-real').send(event).expect(404);
    expect(await t.prisma.paymentEvent.count()).toBe(count);
  });
  it('stores exact raw bytes and deduplicates before any donation transition', async () => {
    const donation = await pending();
    const event = eventFor(donation);
    const first = await receive(event);
    const again = await receive(event);
    expect(again.id).toBe(first.id);
    expect(Buffer.from(first.rawBody).toString()).toBe(JSON.stringify(event));
    expect(first.processedAt).toBeNull();
    expect(
      (
        await t.prisma.donation.findUniqueOrThrow({
          where: { id: donation.id },
        })
      ).status,
    ).toBe('PENDING');
    await runEvent(first.id);
  });
  it('posts balanced ledger entries and success together, once under concurrent delivery', async () => {
    const before = (await t.http().get(`/campaigns/${slug}`).expect(200)).body;
    const donation = await pending();
    const first = await receive(eventFor(donation));
    const second = await receive(eventFor(donation));
    await Promise.all([
      runEvent(first.id),
      runEvent(first.id),
      runEvent(second.id),
    ]);
    const stored = await t.prisma.donation.findUniqueOrThrow({
      where: { id: donation.id },
    });
    expect(stored.status).toBe('SUCCEEDED');
    expect(stored.ledgerTransactionId).not.toBeNull();
    const posting = await t.prisma.ledgerTransaction.findUniqueOrThrow({
      where: { idempotencyKey: `donation:${donation.id}` },
      include: { entries: true },
    });
    expect(posting.entries.reduce((sum, entry) => sum + entry.amount, 0n)).toBe(
      0n,
    );
    expect(posting.entries.map((entry) => entry.amount)).toEqual(
      expect.arrayContaining([101500n, -96500n, -3500n, -1500n]),
    );
    expect(
      await t.prisma.ledgerTransaction.count({
        where: { idempotencyKey: `donation:${donation.id}` },
      }),
    ).toBe(1);
    const after = (await t.http().get(`/campaigns/${slug}`).expect(200)).body;
    expect(BigInt(after.raisedAmount)).toBe(
      BigInt(before.raisedAmount) + 100000n,
    );
    expect(after.donorCount).toBe(before.donorCount + 1);
  });
  it('rejects amount and currency mismatches without moving money', async () => {
    for (const patch of [{ amount: '1014.99' }, { currency: 'USD' }]) {
      const donation = await pending();
      const event = await receive(eventFor(donation, {}, patch));
      await runEvent(event.id);
      expect(
        await t.prisma.paymentEvent.findUnique({ where: { id: event.id } }),
      ).toMatchObject({
        outcome: 'REJECTED',
        reason: 'amount-or-currency-mismatch',
      });
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
    }
  });
  it('allows a failed attempt followed by a newer success, then ignores late failures', async () => {
    const donation = await pending();
    const failed = await receive(
      eventFor(
        donation,
        {
          type: 'collection.failed',
          created_at: new Date(Date.now() - 2000).toISOString(),
        },
        { status: 'FAILED' },
      ),
    );
    await runEvent(failed.id);
    expect(
      (
        await t.prisma.donation.findUniqueOrThrow({
          where: { id: donation.id },
        })
      ).status,
    ).toBe('FAILED');
    const success = await receive(eventFor(donation));
    await runEvent(success.id);
    const later = await receive(
      eventFor(donation, { type: 'collection.failed' }, { status: 'FAILED' }),
    );
    await runEvent(later.id);
    expect(
      (
        await t.prisma.donation.findUniqueOrThrow({
          where: { id: donation.id },
        })
      ).status,
    ).toBe('SUCCEEDED');
    expect(
      await t.prisma.paymentEvent.findUnique({ where: { id: later.id } }),
    ).toMatchObject({ outcome: 'IGNORED', reason: 'already-succeeded' });
  });
  it('ignores an event older than the stored state', async () => {
    const donation = await pending();
    const first = await receive(
      eventFor(donation, { type: 'collection.failed' }, { status: 'FAILED' }),
    );
    await runEvent(first.id);
    const old = await receive(
      eventFor(donation, {
        created_at: new Date(Date.now() - 10000).toISOString(),
      }),
    );
    await runEvent(old.id);
    expect(
      await t.prisma.paymentEvent.findUnique({ where: { id: old.id } }),
    ).toMatchObject({ outcome: 'IGNORED', reason: 'older-than-stored-state' });
  });
  it('expires an abandoned checkout without crediting it', async () => {
    const donation = await pending();
    const event = await receive({
      id: `evt_${randomUUID()}`,
      type: 'checkout.expired',
      data: {
        checkout_id: donation.providerCheckoutId,
        reference: donation.reference,
      },
    });
    await runEvent(event.id);
    expect(
      (
        await t.prisma.donation.findUniqueOrThrow({
          where: { id: donation.id },
        })
      ).status,
    ).toBe('EXPIRED');
    expect(
      await t.prisma.ledgerTransaction.count({
        where: { idempotencyKey: `donation:${donation.id}` },
      }),
    ).toBe(0);
  });
  it('rolls the posting, donation and event back together on internal failure, then retries safely', async () => {
    const donation = await pending();
    const event = await receive(eventFor(donation));
    const ledger = t.app.get(LedgerService);
    const original = ledger.postInTransaction.bind(ledger);
    const spy = vi
      .spyOn(ledger, 'postInTransaction')
      .mockImplementationOnce(async (tx, input) => {
        await original(tx, input);
        throw new Error('Simulated internal failure');
      });
    try {
      await expect(runEvent(event.id)).rejects.toThrow(
        'Simulated internal failure',
      );
    } finally {
      spy.mockRestore();
    }
    expect(
      (
        await t.prisma.donation.findUniqueOrThrow({
          where: { id: donation.id },
        })
      ).status,
    ).toBe('PENDING');
    expect(
      (
        await t.prisma.paymentEvent.findUniqueOrThrow({
          where: { id: event.id },
        })
      ).processedAt,
    ).toBeNull();
    expect(
      await t.prisma.ledgerTransaction.count({
        where: { idempotencyKey: `donation:${donation.id}` },
      }),
    ).toBe(0);
    await runEvent(event.id);
    expect(
      (
        await t.prisma.donation.findUniqueOrThrow({
          where: { id: donation.id },
        })
      ).status,
    ).toBe('SUCCEEDED');
  });
  it('returns 503 on enqueue failure while retaining the event for retry', async () => {
    const donation = await pending();
    const queue = t.app.get(PaymentEventQueue);
    const original = queue.enqueue;
    queue.enqueue = vi.fn().mockRejectedValue(new Error('Redis unavailable'));
    const event = eventFor(donation);
    let stored;
    try {
      stored = await receive(event, t, 503);
    } finally {
      queue.enqueue = original;
    }
    const retry = await receive(event);
    expect(retry.id).toBe(stored.id);
    await runEvent(retry.id);
  });
  it('persists unsupported signed events as ignored without queueing business effects', async () => {
    const event = await receive({
      id: `evt_${randomUUID()}`,
      type: 'customer.created',
      data: {},
    });
    expect(event).toMatchObject({
      outcome: 'IGNORED',
      reason: 'unsupported-event',
    });
    expect(event.processedAt).not.toBeNull();
  });
  it('does not credit a second charge using an already settled donation reference', async () => {
    const donation = await pending();
    await runEvent((await receive(eventFor(donation))).id);
    const extra = await receive(
      eventFor(donation, {}, { charge_id: `ch_extra_${donation.id}` }),
    );
    await runEvent(extra.id);
    expect(
      await t.prisma.paymentEvent.findUnique({ where: { id: extra.id } }),
    ).toMatchObject({
      outcome: 'REJECTED',
      reason: 'additional-payment-needs-reconciliation',
    });
  });
  it('does not allow a succeeded donation without a ledger posting', async () => {
    const donation = await pending();
    await expect(
      t.prisma.donation.update({
        where: { id: donation.id },
        data: { status: 'SUCCEEDED' },
      }),
    ).rejects.toThrow();
  });
  it('uses the real BullMQ worker and recovers a persisted event without a second delivery', async () => {
    const donation = await pending();
    const queue = t.app.get(PaymentEventQueue);
    const original = queue.enqueue;
    queue.enqueue = vi
      .fn()
      .mockRejectedValue(new Error('Simulated enqueue failure'));
    const event = eventFor(donation);
    let stored;
    try {
      stored = await receive(event, t, 503);
    } finally {
      queue.enqueue = original;
    }
    const priorPrefix = processEnvPrefix();
    process.env.PAYMENT_QUEUE_PREFIX = `test-${randomUUID()}`;
    const real = await createTestApp({
      paymentProvider: bachs,
      backgroundJobs: true,
    });
    try {
      await real.app.get(PaymentEventQueue).dispatchPending();
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const current = await t.prisma.paymentEvent.findUniqueOrThrow({
          where: { id: stored.id },
        });
        if (current.processedAt) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(
        (
          await t.prisma.paymentEvent.findUniqueOrThrow({
            where: { id: stored.id },
          })
        ).outcome,
      ).toBe('PROCESSED');
      expect(
        (
          await t.prisma.donation.findUniqueOrThrow({
            where: { id: donation.id },
          })
        ).status,
      ).toBe('SUCCEEDED');
    } finally {
      await real.app.close();
      if (priorPrefix === undefined) delete process.env.PAYMENT_QUEUE_PREFIX;
      else process.env.PAYMENT_QUEUE_PREFIX = priorPrefix;
    }
  }, 20000);
  it('accepts Paystack signatures and deduplicates its synthesized event key', async () => {
    const provider = new PaystackProvider(apiSecret);
    provider.createCheckout = async (data) => ({
      id: data.reference,
      reference: data.reference,
      url: `https://checkout.paystack.com/${data.reference}`,
    });
    const ps = await createTestApp({ paymentProvider: provider });
    try {
      const response = await ps
        .http()
        .post(`/campaigns/${slug}/donations/checkout`)
        .set('Idempotency-Key', randomUUID())
        .send({ amount: '100000', email: 'paystack@example.com' })
        .expect(201);
      const donation = await ps.prisma.donation.findUniqueOrThrow({
        where: { id: response.body.id },
      });
      const paymentId = randomInt(1, 2 ** 40);
      const body = JSON.stringify({
        event: 'charge.success',
        data: {
          id: paymentId,
          status: 'success',
          reference: donation.reference,
          amount: 101500,
          currency: 'NGN',
          paid_at: new Date().toISOString(),
        },
      });
      const signature = createHmac('sha512', apiSecret)
        .update(body)
        .digest('hex');
      for (let i = 0; i < 2; i++)
        await ps
          .http()
          .post('/webhooks/paystack')
          .set('Content-Type', 'application/json')
          .set('X-Paystack-Signature', signature)
          .send(body)
          .expect(202);
      const event = await ps.prisma.paymentEvent.findUniqueOrThrow({
        where: {
          provider_eventId: {
            provider: 'paystack',
            eventId: `charge.success:${paymentId}`,
          },
        },
      });
      await ps.app.get(PaymentEventProcessor).process(event.id);
      expect(
        (
          await ps.prisma.donation.findUniqueOrThrow({
            where: { id: donation.id },
          })
        ).status,
      ).toBe('SUCCEEDED');
    } finally {
      await ps.app.close();
    }
  });
});
function processEnvPrefix() {
  return globalThis.process.env.PAYMENT_QUEUE_PREFIX;
}
