import { createHmac, randomUUID, randomInt } from 'node:crypto';
import { BachsProvider } from '../src/payments/adapters/bachs.js';
import { PaystackProvider } from '../src/payments/adapters/paystack.js';
import { PaymentProviderError } from '../src/payments/provider-http.js';
import type { PayoutInput } from '../src/payments/payment-provider.js';
import { LedgerService } from '../src/ledger/ledger.service.js';
import { PaymentEventProcessor } from '../src/webhooks/payment-event.processor.js';
import type { Withdrawal } from '../src/generated/prisma/client.js';
import {
  createTestApp,
  signUpUser,
  type TestApp,
  type TestUser,
} from './helpers.js';
const secret = 'withdrawal-test-secret';
const provider = new PaystackProvider(secret);
const payout = vi.fn(async (input: PayoutInput) => ({
  id: `TRF_${input.reference}`,
  reference: input.reference,
  status: 'pending' as const,
}));
provider.createPayout = payout;
let eventSequence = randomInt(1, 2_000_000_000);
describe('campaign withdrawals', () => {
  let t: TestApp,
    owner: TestUser,
    other: TestUser,
    admin: TestUser,
    unverified: TestUser,
    ledger: LedgerService;
  let campaignId: string, bankId: string;
  beforeAll(async () => {
    t = await createTestApp({ paymentProvider: provider });
    owner = await signUpUser(t, { verified: true });
    other = await signUpUser(t, { verified: true });
    admin = await signUpUser(t, { admin: true, verified: true });
    unverified = await signUpUser(t);
    ledger = t.app.get(LedgerService);
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    payout.mockReset();
    payout.mockImplementation(async (input) => ({
      id: `TRF_${input.reference}`,
      reference: input.reference,
      status: 'pending',
    }));
    const category = await t.prisma.category.findFirstOrThrow();
    const campaign = await t.prisma.campaign.create({
      data: {
        slug: `withdraw-${randomUUID()}`,
        title: 'Withdrawal campaign',
        ownerId: owner.id,
        categoryId: category.id,
        status: 'ACTIVE',
        currency: 'NGN',
        goalAmount: 100000000n,
      },
    });
    campaignId = campaign.id;
    const bank = await t.prisma.bankAccount.create({
      data: {
        userId: owner.id,
        bankCode: '058',
        bankName: 'Test Bank',
        accountNumber: '0123456789',
        accountName: 'Test User',
        provider: 'paystack',
        recipientId: `RCP_${randomUUID()}`,
        recipientUsable: true,
        nameMatchesProfile: true,
        payoutsAvailableAt: new Date(Date.now() - 1000),
      },
    });
    bankId = bank.id;
    await ledger.post({
      kind: 'ADJUSTMENT',
      idempotencyKey: `fund:${campaignId}`,
      currency: 'NGN',
      description: 'Test campaign funding',
      entries: [
        {
          account: { type: 'PROVIDER_CLEARING', currency: 'NGN' },
          amount: 3000000n,
        },
        {
          account: { type: 'CAMPAIGN_WALLET', currency: 'NGN', campaignId },
          amount: -3000000n,
        },
      ],
    });
  });
  const url = () => `/campaigns/${campaignId}/withdrawals`;
  const body = (patch = {}) => ({
    amount: '2000000',
    bankAccountId: bankId,
    expectedFee: '5000',
    ...patch,
  });
  const request = (patch = {}, key: string = randomUUID(), user = owner) =>
    t
      .http()
      .post(url())
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('Idempotency-Key', key)
      .send(body(patch));
  const balance = () =>
    ledger.balance({ type: 'CAMPAIGN_WALLET', currency: 'NGN', campaignId });
  async function stored(id: string) {
    return t.prisma.withdrawal.findUniqueOrThrow({ where: { id } });
  }
  async function event(
    w: Withdrawal,
    type = 'transfer.success',
    patch: Record<string, unknown> = {},
  ) {
    const data = {
      id: eventSequence++,
      transfer_code: w.providerPayoutId ?? `TRF_${w.reference}`,
      reference: w.reference,
      amount: Number(w.netPaidOut),
      currency: w.currency,
      created_at: new Date().toISOString(),
      ...patch,
    };
    const raw = JSON.stringify({ event: type, data });
    const signature = createHmac('sha512', secret).update(raw).digest('hex');
    await t
      .http()
      .post('/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(raw)
      .expect(202);
    const received = await t.prisma.paymentEvent.findUniqueOrThrow({
      where: {
        provider_eventId: {
          provider: 'paystack',
          eventId: `${type}:${data.id}`,
        },
      },
    });
    await t.app.get(PaymentEventProcessor).process(received.id);
    return received.id;
  }
  it('quotes the exact fee without reserving funds or sending money', async () => {
    const quote = await t
      .http()
      .post(`${url()}/quote`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ amount: '2000000' })
      .expect(201);
    expect(quote.body).toMatchObject({
      amount: '2000000',
      fee: '5000',
      netPaidOut: '1995000',
      availableBalance: '3000000',
      currency: 'NGN',
      payoutsFrozen: false,
    });
    expect(await balance()).toBe(3000000n);
    expect(payout).not.toHaveBeenCalled();
  });
  it('reserves gross funds once, sends only net and keeps an immutable masked destination snapshot', async () => {
    const key = randomUUID();
    const response = await request({}, key).expect(201);
    expect(response.body).toMatchObject({
      amount: '2000000',
      fee: '5000',
      netPaidOut: '1995000',
      status: 'PENDING',
      maskedAccountNumber: '******6789',
    });
    expect(response.body).not.toHaveProperty('recipientId');
    expect(response.body).not.toHaveProperty('reference');
    expect(response.body).not.toHaveProperty('idempotencyKeyHash');
    expect(JSON.stringify(response.body)).not.toContain('0123456789');
    expect(await balance()).toBe(1000000n);
    expect(payout).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1995000n, currency: 'NGN' }),
    );
    const again = await request({}, key).expect(201);
    expect(again.body.id).toBe(response.body.id);
    expect(payout).toHaveBeenCalledTimes(1);
    await request({ amount: '1000000' }, key).expect(409);
    await t.prisma.bankAccount.update({
      where: { id: bankId },
      data: { removedAt: new Date(), accountName: 'Changed' },
    });
    const status = await t
      .http()
      .get(`/withdrawals/${response.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(status.body.accountName).toBe('Test User');
  });
  it('cannot overspend with simultaneous different keys and cannot dispatch twice with the same key', async () => {
    const responses = await Promise.all([request(), request()]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(payout).toHaveBeenCalledTimes(1);
    expect(await balance()).toBe(1000000n);
    // Same-key contention on a different funded campaign amount that still fits.
    const key = randomUUID();
    const replay = await Promise.all([
      request({ amount: '500000' }, key),
      request({ amount: '500000' }, key),
    ]);
    expect(replay.map((r) => r.status)).toEqual([201, 201]);
    expect(replay[0]!.body.id).toBe(replay[1]!.body.id);
    expect(payout).toHaveBeenCalledTimes(2);
    expect(await balance()).toBe(500000n);
  });
  it('settles signed success once, ignores pending regressions, and returns a reversed payout once', async () => {
    const r = await request().expect(201);
    const w = await stored(r.body.id);
    const id = await event(w);
    await t.app.get(PaymentEventProcessor).process(id);
    await event(w);
    expect((await stored(w.id)).status).toBe('SUCCEEDED');
    expect(await balance()).toBe(1000000n);
    expect(
      await t.prisma.ledgerTransaction.count({
        where: { idempotencyKey: `withdrawal:${w.id}:settle` },
      }),
    ).toBe(1);
    await event(w, 'transfer.reversed');
    await event(w, 'transfer.reversed');
    expect((await stored(w.id)).status).toBe('REVERSED');
    expect(await balance()).toBe(3000000n);
    expect((await ledger.integrity()).ok).toBe(true);
  });
  it('returns failed holds once and flags a contradictory late success without debiting the wallet again', async () => {
    const r = await request().expect(201);
    const w = await stored(r.body.id);
    await event(w, 'transfer.failed');
    await event(w, 'transfer.failed');
    expect(await balance()).toBe(3000000n);
    await event(w, 'transfer.success');
    expect(await balance()).toBe(3000000n);
    expect(await stored(w.id)).toMatchObject({
      status: 'FAILED',
      reconciliationRequired: true,
      reason: 'conflicting-terminal-event',
    });
  });
  it('retains uncertain holds across replays, then resolves from an exact signed webhook', async () => {
    payout.mockRejectedValueOnce(
      new PaymentProviderError('transport-error', undefined, true),
    );
    const key = randomUUID();
    const r = await request({}, key).expect(201);
    expect(r.body).toMatchObject({
      status: 'UNCERTAIN',
      reconciliationRequired: true,
    });
    expect(await balance()).toBe(1000000n);
    await request({}, key).expect(201);
    expect(payout).toHaveBeenCalledTimes(1);
    await event(await stored(r.body.id));
    expect((await stored(r.body.id)).status).toBe('SUCCEEDED');
    expect(await balance()).toBe(1000000n);
  });
  it('returns funds after explicit provider rejection and never retries the rejected key', async () => {
    payout.mockRejectedValueOnce(
      new PaymentProviderError('http-error', 422, false),
    );
    const key = randomUUID();
    const r = await request({}, key).expect(201);
    expect(r.body.status).toBe('FAILED');
    expect(await balance()).toBe(3000000n);
    await request({}, key).expect(201);
    expect(payout).toHaveBeenCalledTimes(1);
  });
  it('rejects mismatched webhook amounts, currencies and payout identifiers without releasing the hold', async () => {
    const r = await request().expect(201);
    const w = await stored(r.body.id);
    await event(w, 'transfer.success', { amount: Number(w.netPaidOut) + 1 });
    await event(w, 'transfer.failed', { currency: 'USD' });
    await event(w, 'transfer.success', { transfer_code: 'TRF_wrong' });
    expect(await balance()).toBe(1000000n);
    expect(await stored(w.id)).toMatchObject({
      status: 'PENDING',
      reconciliationRequired: true,
    });
  });
  it('requires ownership, verified email, valid inputs and matching fee review', async () => {
    await t.http().post(url()).send(body()).expect(401);
    await request({}, randomUUID(), other).expect(404);
    await t.prisma.campaign.update({
      where: { id: campaignId },
      data: { ownerId: unverified.id },
    });
    await request({}, randomUUID(), unverified).expect(403);
    await t.prisma.campaign.update({
      where: { id: campaignId },
      data: { ownerId: owner.id },
    });
    for (const patch of [
      { amount: '1.5' },
      { amount: '0' },
      { amount: '9223372036854775808' },
      { amount: '5000' },
    ])
      await request(patch).expect(400);
    await request({ expectedFee: '0' }).expect(409);
    await request({}, 'not-a-uuid').expect(400);
    expect(payout).not.toHaveBeenCalled();
  });
  it('blocks ineligible, held, foreign and removed bank accounts and unsupported currencies', async () => {
    await t.prisma.bankAccount.update({
      where: { id: bankId },
      data: { payoutsAvailableAt: new Date(Date.now() + 86400000) },
    });
    await request().expect(409);
    await t.prisma.bankAccount.update({
      where: { id: bankId },
      data: { payoutsAvailableAt: new Date(0), recipientUsable: false },
    });
    await request().expect(409);
    await t.prisma.bankAccount.update({
      where: { id: bankId },
      data: { recipientUsable: true, provider: 'bachs' },
    });
    await request().expect(409);
    await t.prisma.bankAccount.update({
      where: { id: bankId },
      data: { provider: 'paystack', userId: other.id },
    });
    await request().expect(404);
    await t.prisma.bankAccount.update({
      where: { id: bankId },
      data: { userId: owner.id, removedAt: new Date() },
    });
    await request().expect(404);
    await t.prisma.campaign.update({
      where: { id: campaignId },
      data: { currency: 'USD' },
    });
    await request().expect(400);
    expect(payout).not.toHaveBeenCalled();
  });
  it('allows admins to freeze new reservations with an audit trail, while owners cannot change a freeze', async () => {
    const freeze = `/admin/campaigns/${campaignId}/payout-freeze`;
    await t
      .http()
      .put(freeze)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ frozen: true, reason: 'Needs review' })
      .expect(403);
    await t
      .http()
      .put(freeze)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ frozen: true, reason: 'Needs review' })
      .expect(200);
    await request().expect(403);
    await t
      .http()
      .put(freeze)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ frozen: false, reason: 'Review finished' })
      .expect(200);
    await request().expect(201);
    expect(
      await t.prisma.payoutFreezeEvent.count({ where: { campaignId } }),
    ).toBe(2);
  });
  it('keeps withdrawal history private and paginated', async () => {
    const r = await request().expect(201);
    await t
      .http()
      .get(`/withdrawals/${r.body.id}`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(404);
    await t
      .http()
      .get(url())
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(404);
    const list = await t
      .http()
      .get(url())
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(list.body).toMatchObject({
      page: 1,
      hasMore: false,
      items: [{ id: r.body.id }],
    });
    await t
      .http()
      .get(`${url()}?page=0`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(400);
  });
  it('does not regress a webhook that arrives before a failed HTTP response', async () => {
    payout.mockImplementationOnce(async (input) => {
      const w = await t.prisma.withdrawal.findUniqueOrThrow({
        where: { reference: input.reference },
      });
      await event(w);
      throw new PaymentProviderError('transport-error', undefined, true);
    });
    const r = await request().expect(201);
    expect(r.body.status).toBe('SUCCEEDED');
    expect(await balance()).toBe(1000000n);
    expect(payout).toHaveBeenCalledTimes(1);
  });
  it('exposes only money and status in the public withdrawal trail', async () => {
    const r = await request().expect(201);
    const c = await t.prisma.campaign.findUniqueOrThrow({
      where: { id: campaignId },
    });
    const path = `/campaigns/${c.slug}/money-trail/withdrawals`;
    const response = await t.http().get(path).expect(200);
    expect(response.body.items[0]).toEqual({
      id: r.body.id,
      amount: '2000000',
      fee: '5000',
      netPaidOut: '1995000',
      currency: 'NGN',
      status: 'PENDING',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(JSON.stringify(response.body)).not.toContain(bankId);
    await t.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'DRAFT' },
    });
    await t.http().get(path).expect(404);
  });
  it('settles Bachs same-currency payouts through its signed decimal-amount webhook', async () => {
    const bachs = new BachsProvider('test-api-key', 'test-bachs-signature');
    bachs.createPayout = async (input) => ({
      id: `pay_${input.reference}`,
      reference: input.reference,
      status: 'pending',
    });
    const b = await createTestApp({ paymentProvider: bachs });
    try {
      await t.prisma.bankAccount.update({
        where: { id: bankId },
        data: { provider: 'bachs' },
      });
      const response = await b
        .http()
        .post(url())
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .set('Idempotency-Key', randomUUID())
        .send(body())
        .expect(201);
      const w = await stored(response.body.id);
      const raw = JSON.stringify({
        id: `evt_${randomUUID()}`,
        type: 'payout.paid',
        created_at: new Date().toISOString(),
        data: {
          withdrawal_id: w.providerPayoutId,
          reference: w.reference,
          amount: '19950.00',
          currency: 'NGN',
          from_currency: 'NGN',
          to_currency: 'NGN',
        },
      });
      const timestamp = Math.floor(Date.now() / 1000);
      const digest = createHmac('sha256', 'test-bachs-signature')
        .update(`${timestamp}.${raw}`)
        .digest('hex');
      await b
        .http()
        .post('/webhooks/bachs')
        .set('Content-Type', 'application/json')
        .set('X-Bachs-Signature-V2', `t=${timestamp},v1=${digest}`)
        .send(raw)
        .expect(202);
      const received = await b.prisma.paymentEvent.findUniqueOrThrow({
        where: {
          provider_eventId: { provider: 'bachs', eventId: JSON.parse(raw).id },
        },
      });
      await b.app.get(PaymentEventProcessor).process(received.id);
      expect((await stored(w.id)).status).toBe('SUCCEEDED');
      expect(await balance()).toBe(1000000n);
    } finally {
      await b.app.close();
    }
  });
  it('shows stale initialization and uncertain outcomes only to administrators and never redispatches them', async () => {
    const key = randomUUID();
    const r = await request({}, key).expect(201);
    await t.prisma.withdrawal.update({
      where: { id: r.body.id },
      data: {
        status: 'INITIALIZING',
        createdAt: new Date(Date.now() - 120000),
      },
    });
    await t
      .http()
      .get('/admin/withdrawals/review')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(403);
    const review = await t
      .http()
      .get('/admin/withdrawals/review')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      review.body.items.some((w: { id: string }) => w.id === r.body.id),
    ).toBe(true);
    expect(
      review.body.items.find((w: { id: string }) => w.id === r.body.id),
    ).toMatchObject({
      reconciliationRequired: true,
      reference: expect.any(String),
    });
    expect(JSON.stringify(review.body)).not.toContain('0123456789');
    await request({}, key).expect(201);
    expect(payout).toHaveBeenCalledTimes(1);
  });
});
