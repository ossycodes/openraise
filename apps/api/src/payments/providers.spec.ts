import { createHmac } from 'node:crypto';
import { BachsProvider } from './adapters/bachs.js';
import { PaystackProvider } from './adapters/paystack.js';
import paystack from './fixtures/paystack.json' with { type: 'json' };
import bachs from './fixtures/bachs.json' with { type: 'json' };
import { PaymentProviderError, ProviderHttp } from './provider-http.js';

const secret = 'test-api-secret';
const signingSecret = 'test-endpoint-secret';
const now = 1_800_000_000_000;
const checkout = {
  amount: 250_000n,
  currency: 'NGN' as const,
  reference: 'donation_0001',
  email: 'donor@example.com',
  successUrl: 'https://example.com/thanks',
  cancelUrl: 'https://example.com/cancel',
  metadata: { donationId: 'donation_0001' },
};
const account = {
  country: 'NG' as const,
  bankCode: '058',
  accountNumber: '0123456789',
};
const recipient = {
  ...account,
  currency: 'NGN' as const,
  accountName: 'EXAMPLE HOLDER',
  idempotencyKey: 'recipient_0001',
};
const payout = {
  amount: 100_000n,
  currency: 'NGN' as const,
  recipientId: 'pd_example',
  reference: 'payout_0001',
};
const refund = {
  amount: 1_000n,
  currency: 'NGN' as const,
  paymentId: 'ch_example',
  reference: 'refund_0001',
};

function transport(...responses: unknown[]) {
  return vi.fn<typeof fetch>().mockImplementation(async () => {
    if (!responses.length) throw new Error('Unexpected extra request');
    return new Response(JSON.stringify(responses.shift()), { status: 200 });
  });
}
function requestBody(mock: ReturnType<typeof transport>, call = 0) {
  return JSON.parse(mock.mock.calls[call]?.[1]?.body as string);
}
function signPaystack(event: unknown) {
  const raw = Buffer.from(JSON.stringify(event));
  return {
    raw,
    headers: {
      'x-paystack-signature': createHmac('sha512', secret)
        .update(raw)
        .digest('hex'),
    },
  };
}
function signBachs(event: unknown, timestamp = now / 1000) {
  const raw = Buffer.from(JSON.stringify(event));
  const digest = createHmac('sha256', signingSecret)
    .update(`${timestamp}.`)
    .update(raw)
    .digest('hex');
  return {
    raw,
    headers: { 'x-bachs-signature-v2': `t=${timestamp},v1=${digest}` },
  };
}

describe('Paystack adapter contracts', () => {
  it('creates checkout with exact minor units, reference and redirects', async () => {
    const fetcher = transport(paystack.checkout);
    const provider = new PaystackProvider(secret, fetcher);
    expect(await provider.createCheckout(checkout)).toEqual({
      id: 'donation_0001',
      reference: 'donation_0001',
      url: paystack.checkout.data.authorization_url,
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://api.paystack.co/transaction/initialize',
    );
    expect(requestBody(fetcher)).toEqual({
      amount: 250000,
      currency: 'NGN',
      reference: 'donation_0001',
      email: checkout.email,
      callback_url: checkout.successUrl,
      metadata: {
        donationId: 'donation_0001',
        cancel_action: checkout.cancelUrl,
      },
    });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${secret}`,
    });
  });
  it('verifies and normalizes confirmed payments', async () => {
    const provider = new PaystackProvider(secret, transport(paystack.payment));
    expect(await provider.verifyPayment('donation_0001')).toEqual({
      id: '4099260516',
      reference: 'donation_0001',
      amount: 250000n,
      currency: 'NGN',
      status: 'succeeded',
    });
  });
  it.each(['pending', 'processing', 'failed', 'surprise'])(
    'maps %s without inventing success',
    async (status) => {
      const provider = new PaystackProvider(
        secret,
        transport({ status: true, data: { ...paystack.payment.data, status } }),
      );
      expect((await provider.verifyPayment('donation_0001')).status).toBe(
        status === 'surprise'
          ? 'unknown'
          : status === 'processing'
            ? 'pending'
            : status,
      );
    },
  );
  it('rejects rounded JSON amounts and mismatched references', async () => {
    for (const patch of [
      { amount: 9007199254740992 },
      { reference: 'different_0001' },
      { currency: 'EUR' },
    ]) {
      const provider = new PaystackProvider(
        secret,
        transport({
          status: true,
          data: { ...paystack.payment.data, ...patch },
        }),
      );
      await expect(provider.verifyPayment('donation_0001')).rejects.toThrow(
        PaymentProviderError,
      );
    }
  });
  it('refuses unsafe amounts and amounts below provider minimum before sending', async () => {
    const fetcher = transport();
    const provider = new PaystackProvider(secret, fetcher);
    for (const amount of [1n, -1n, 9007199254740992n]) {
      await expect(
        provider.createCheckout({ ...checkout, amount }),
      ).rejects.toMatchObject({ code: 'invalid-input' });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('lists banks across cursor pages', async () => {
    const fetcher = transport(
      { ...paystack.banks, meta: { next: 'page_two' } },
      paystack.banks,
    );
    const provider = new PaystackProvider(secret, fetcher);
    expect(await provider.listBanks('NG')).toHaveLength(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('next=page_two');
  });
  it('rejects looping bank pagination', async () => {
    const page = { ...paystack.banks, meta: { next: 'same' } };
    await expect(
      new PaystackProvider(secret, transport(page, page)).listBanks('NG'),
    ).rejects.toThrow(PaymentProviderError);
  });
  it('resolves accounts and creates recipients', async () => {
    const fetcher = transport(paystack.account, paystack.recipient);
    const provider = new PaystackProvider(secret, fetcher);
    expect(await provider.resolveAccount(account)).toEqual({
      resolved: true,
      accountNumber: account.accountNumber,
      accountName: recipient.accountName,
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      'account_number=0123456789&bank_code=058',
    );
    expect(await provider.createRecipient(recipient)).toEqual({
      id: 'RCP_example',
      usable: true,
    });
    expect(requestBody(fetcher, 1)).toMatchObject({
      type: 'nuban',
      currency: 'NGN',
      account_number: account.accountNumber,
    });
  });
  it('creates referenced payouts and refunds without treating pending as paid', async () => {
    const fetcher = transport(paystack.payout, paystack.refund);
    const provider = new PaystackProvider(secret, fetcher);
    expect(await provider.createPayout(payout)).toEqual({
      id: 'TRF_example',
      reference: 'payout_0001',
      status: 'pending',
    });
    expect(requestBody(fetcher)).toMatchObject({
      source: 'balance',
      amount: 100000,
      reference: 'payout_0001',
    });
    expect(await provider.refund(refund)).toEqual({
      id: '1',
      reference: 'refund_0001',
      status: 'pending',
    });
    expect(requestBody(fetcher, 1)).toMatchObject({
      amount: 1000,
      transaction: 'ch_example',
      reference: 'refund_0001',
    });
  });
  it('verifies raw bytes and returns stable payment event keys', () => {
    const provider = new PaystackProvider(secret, transport());
    const { raw, headers } = signPaystack(paystack.webhook);
    expect(provider.verifyWebhook(raw, headers)).toBe(true);
    expect(
      provider.verifyWebhook(Buffer.concat([raw, Buffer.from(' ')]), headers),
    ).toBe(false);
    expect(provider.parseWebhook(raw, headers)).toEqual({
      provider: 'paystack',
      id: 'charge.success:4099260516',
      type: 'payment.succeeded',
      resourceId: '4099260516',
      reference: 'donation_0001',
      money: { amount: 250000n, currency: 'NGN' },
    });
    expect(provider.parseWebhook(raw, headers)).toEqual(
      provider.parseWebhook(raw, headers),
    );
  });
  it('keeps transfer transitions distinct for deduplication', () => {
    const provider = new PaystackProvider(secret, transport());
    const ids = [
      'transfer.success',
      'transfer.failed',
      'transfer.reversed',
    ].map((event) => {
      const { raw, headers } = signPaystack({
        event,
        data: {
          id: 12,
          transfer_code: 'TRF_example',
          reference: 'payout_0001',
          amount: 100000,
          currency: 'NGN',
        },
      });
      return provider.parseWebhook(raw, headers)?.id;
    });
    expect(new Set(ids).size).toBe(3);
  });
});

describe('Bachs adapter contracts', () => {
  const provider = (fetcher = transport()) =>
    new BachsProvider(secret, signingSecret, undefined, fetcher, () => now);
  it('uses productless pricing and stable idempotency keys', async () => {
    const fetcher = transport(bachs.checkout);
    expect(await provider(fetcher).createCheckout(checkout)).toEqual({
      id: 'chk_example',
      reference: 'donation_0001',
      url: bachs.checkout.checkout_url,
    });
    expect(requestBody(fetcher)).toMatchObject({
      pricing: { amount: '2500.00', currency: 'NGN' },
      reference: 'donation_0001',
      success_url: checkout.successUrl,
      cancel_url: checkout.cancelUrl,
    });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      'Idempotency-Key': 'donation_0001',
    });
  });
  it('preserves values beyond the safe number range as decimal strings', async () => {
    const fetcher = transport(bachs.checkout);
    await provider(fetcher).createCheckout({
      ...checkout,
      amount: 900719925474099301n,
    });
    expect(requestBody(fetcher).pricing.amount).toBe('9007199254740993.01');
  });
  it('enforces the OpenRaise Bachs NGN floor before sending', async () => {
    const fetcher = transport();
    await expect(
      provider(fetcher).createCheckout({ ...checkout, amount: 99999n }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('requires actual payment verification after retrieving the session', async () => {
    const fetcher = transport(bachs.session, bachs.payment);
    expect(await provider(fetcher).verifyPayment('chk_example')).toEqual({
      id: 'ch_example',
      reference: 'donation_0001',
      amount: 250000n,
      currency: 'NGN',
      status: 'succeeded',
    });
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      'https://sandbox-api.bachs.io/v1/checkout-sessions/chk_example',
      'https://sandbox-api.bachs.io/v1/payments/ch_example',
    ]);
  });
  it('keeps an unpaid checkout pending and rejects a completed card-only setup as unknown', async () => {
    for (const status of ['open', 'completed', 'expired']) {
      const result = await provider(
        transport({ ...bachs.session, status, charge: null }),
      ).verifyPayment('chk_example');
      expect(result.status).toBe(
        status === 'open'
          ? 'pending'
          : status === 'expired'
            ? 'failed'
            : 'unknown',
      );
    }
  });
  it.each([
    'accepted',
    'underpaid',
    'overpaid',
    'partially_refunded',
    'new-status',
  ])('keeps %s for reconciliation', async (status) => {
    expect(
      (
        await provider(
          transport(bachs.session, { ...bachs.payment, status }),
        ).verifyPayment('chk_example')
      ).status,
    ).toBe('unknown');
  });
  it('never confirms a succeeded status with a different paid amount', async () => {
    expect(
      (
        await provider(
          transport(bachs.session, {
            ...bachs.payment,
            amount_paid: '2499.99',
          }),
        ).verifyPayment('chk_example')
      ).status,
    ).toBe('unknown');
  });
  it('rejects malformed money and unknown currency', async () => {
    for (const patch of [
      { amount: '2,500.00' },
      { amount: '2500.001' },
      { amount: 2500 },
      { currency: 'EUR' },
    ]) {
      await expect(
        provider(
          transport(bachs.session, { ...bachs.payment, ...patch }),
        ).verifyPayment('chk_example'),
      ).rejects.toThrow(PaymentProviderError);
    }
  });
  it('lists banks and resolves accounts including unresolved results', async () => {
    const fetcher = transport(bachs.banks, bachs.account, {
      resolved: false,
      account_name: null,
    });
    expect(await provider(fetcher).listBanks('NG')).toEqual([
      { code: '058', name: 'Example Bank' },
    ]);
    expect(await provider(fetcher).resolveAccount(account)).toMatchObject({
      resolved: true,
      accountName: 'EXAMPLE HOLDER',
    });
    expect(requestBody(fetcher, 1)).toEqual({
      country: 'NG',
      bank_code: '058',
      account_number: '0123456789',
    });
    expect(await provider(fetcher).resolveAccount(account)).toEqual({
      resolved: false,
    });
  });
  it('reports recipient review state and checks destination before payout', async () => {
    const fetcher = transport(
      { ...bachs.recipient, is_usable: false },
      bachs.recipient,
      bachs.payout,
    );
    expect(await provider(fetcher).createRecipient(recipient)).toEqual({
      id: 'pd_example',
      usable: false,
    });
    expect(await provider(fetcher).createPayout(payout)).toEqual({
      id: 'pay_example',
      reference: 'payout_0001',
      status: 'pending',
    });
    expect(requestBody(fetcher, 2)).toEqual({
      destination: 'pd_example',
      amount: '1000.00',
      reference: 'payout_0001',
    });
    expect(fetcher.mock.calls[2]?.[1]?.headers).toMatchObject({
      'Idempotency-Key': 'payout_0001',
    });
  });
  it('does not send a payout to an unapproved or different-currency destination', async () => {
    for (const patch of [{ is_usable: false }, { currency: 'USD' }]) {
      const fetcher = transport({ ...bachs.recipient, ...patch });
      await expect(
        provider(fetcher).createPayout(payout),
      ).rejects.toMatchObject({ code: 'unsupported' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it('creates refunds with settlement amount strings and stable references', async () => {
    const fetcher = transport(bachs.refund);
    expect(await provider(fetcher).refund(refund)).toEqual({
      id: 'ref_example',
      reference: 'refund_0001',
      status: 'pending',
    });
    expect(requestBody(fetcher)).toMatchObject({
      charge_id: 'ch_example',
      amount: '10.00',
      fee_bearer: 'org',
      reference: 'refund_0001',
      idempotency_key: 'refund_0001',
    });
  });
  it('accepts any matching V2 signature during rotation', () => {
    const { raw, headers } = signBachs(bachs.webhook);
    const rotated = {
      'X-Bachs-Signature-V2': headers['x-bachs-signature-v2'].replace(
        ',v1=',
        `,v1=${'0'.repeat(64)},v1=`,
      ),
    };
    expect(provider().verifyWebhook(raw, rotated)).toBe(true);
    expect(provider().parseWebhook(raw, rotated)).toEqual({
      provider: 'bachs',
      id: 'evt_example',
      type: 'payment.succeeded',
      resourceId: 'ch_example',
      reference: 'donation_0001',
      money: { amount: 250000n, currency: 'NGN' },
    });
  });
  it('rejects stale, future, malformed and duplicate-timestamp signatures', () => {
    for (const time of [now / 1000 - 301, now / 1000 + 301]) {
      const { raw, headers } = signBachs(bachs.webhook, time);
      expect(provider().verifyWebhook(raw, headers)).toBe(false);
    }
    const { raw, headers } = signBachs(bachs.webhook);
    for (const signature of [
      't=NaN,v1=abc',
      `t=1800000000,${headers['x-bachs-signature-v2']}`,
      'v1=abc',
    ]) {
      expect(
        provider().verifyWebhook(raw, { 'x-bachs-signature-v2': signature }),
      ).toBe(false);
    }
    expect(
      provider().verifyWebhook(Buffer.concat([raw, Buffer.from(' ')]), headers),
    ).toBe(false);
  });
  it('ignores nonexact collections, deposits and unsigned or unsupported event types safely', () => {
    for (const patch of [
      { status: 'ACCEPTED' },
      { charge_id: null },
      { checkout_id: null },
      { reference: null },
    ]) {
      const { raw, headers } = signBachs({
        ...bachs.webhook,
        data: { ...bachs.webhook.data, ...patch },
      });
      expect(provider().parseWebhook(raw, headers)).toBeNull();
    }
    const { raw, headers } = signBachs({
      ...bachs.webhook,
      type: 'checkout.completed',
    });
    expect(provider().parseWebhook(raw, headers)).toBeNull();
    expect(() => provider().parseWebhook(raw, {})).toThrow(
      PaymentProviderError,
    );
  });
});

describe('provider HTTP failures', () => {
  it('redacts upstream bodies and does not retry uncertain writes', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('secret upstream details', { status: 503 }),
      );
    const http = new ProviderHttp('https://example.com', secret, fetcher);
    await expect(
      http.request('/create', { amount: 100 }),
    ).rejects.toMatchObject({
      code: 'http-error',
      status: 503,
      uncertain: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('distinguishes rejected requests from unknown outcomes', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('private', { status: 400 }));
    await expect(
      new ProviderHttp('https://example.com', secret, fetcher).request(
        '/create',
        {},
      ),
    ).rejects.toMatchObject({ code: 'http-error', uncertain: false });
  });
  it('redacts transport errors and flags uncertain writes', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('token secret'));
    await expect(
      new ProviderHttp('https://example.com', secret, fetcher).request(
        '/create',
        {},
      ),
    ).rejects.toMatchObject({
      message: 'Payment provider transport-error',
      uncertain: true,
    });
  });
  it('uses an abort deadline and refuses redirects', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) => {
        expect(init?.redirect).toBe('error');
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        throw new DOMException('aborted', 'TimeoutError');
      });
    await expect(
      new ProviderHttp('https://example.com', secret, fetcher, 5).request(
        '/read',
      ),
    ).rejects.toMatchObject({ code: 'transport-error', uncertain: false });
  });
  it('rejects malformed JSON without exposing it', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('not-json'));
    await expect(
      new ProviderHttp('https://example.com', secret, fetcher).request(
        '/create',
        {},
      ),
    ).rejects.toMatchObject({ code: 'invalid-response', uncertain: true });
  });
});

describe('webhook and response edge cases', () => {
  it('rejects missing, malformed and duplicate signature headers before parsing', () => {
    const provider = new PaystackProvider(secret, transport());
    const { raw, headers } = signPaystack(paystack.webhook);
    for (const invalid of [
      {},
      { 'x-paystack-signature': 'a' },
      { 'x-paystack-signature': ['a', 'b'] },
      { ...headers, 'X-Paystack-Signature': headers['x-paystack-signature'] },
    ]) {
      expect(provider.verifyWebhook(raw, invalid)).toBe(false);
      expect(() => provider.parseWebhook(raw, invalid)).toThrow(
        PaymentProviderError,
      );
    }
  });
  it.each(['unrecognized.event', 'constructor', '__proto__'])(
    'ignores unknown event %s',
    (event) => {
      const ps = signPaystack({ event, data: {} });
      expect(
        new PaystackProvider(secret, transport()).parseWebhook(
          ps.raw,
          ps.headers,
        ),
      ).toBeNull();
      const bs = signBachs({ id: 'evt_example', type: event, data: {} });
      expect(
        new BachsProvider(
          secret,
          signingSecret,
          undefined,
          transport(),
          () => now,
        ).parseWebhook(bs.raw, bs.headers),
      ).toBeNull();
    },
  );
  it('rejects signed malformed JSON and contradictory success states', () => {
    const provider = new PaystackProvider(secret, transport());
    const raw = Buffer.from('{broken');
    const headers = {
      'x-paystack-signature': createHmac('sha512', secret)
        .update(raw)
        .digest('hex'),
    };
    expect(() => provider.parseWebhook(raw, headers)).toThrow(
      PaymentProviderError,
    );
    const bad = signPaystack({
      ...paystack.webhook,
      data: { ...paystack.webhook.data, status: 'failed' },
    });
    expect(() => provider.parseWebhook(bad.raw, bad.headers)).toThrow(
      PaymentProviderError,
    );
  });
  it('normalizes Bachs payout, refund and expiry resource identifiers', () => {
    const provider = new BachsProvider(
      secret,
      signingSecret,
      undefined,
      transport(),
      () => now,
    );
    for (const [type, field, normalized] of [
      ['payout.paid', 'withdrawal_id', 'payout.succeeded'],
      ['refund.paid', 'refund_id', 'refund.succeeded'],
      ['checkout.expired', 'checkout_id', 'checkout.expired'],
    ]) {
      const signed = signBachs({
        id: 'evt_example',
        type,
        data: {
          [field!]: 'resource_example',
          reference: 'merchant_0001',
          amount: '1000.00',
          currency: 'NGN',
        },
      });
      expect(provider.parseWebhook(signed.raw, signed.headers)).toMatchObject({
        id: 'evt_example',
        type: normalized,
        resourceId: 'resource_example',
        reference: 'merchant_0001',
      });
    }
  });
  it('rejects non-HTTPS hosted checkout URLs', async () => {
    await expect(
      new PaystackProvider(
        secret,
        transport({
          ...paystack.checkout,
          data: {
            ...paystack.checkout.data,
            authorization_url: 'javascript:alert(1)',
          },
        }),
      ).createCheckout(checkout),
    ).rejects.toMatchObject({ code: 'invalid-response', uncertain: true });
  });
  it('marks malformed successful write responses uncertain', async () => {
    await expect(
      new PaystackProvider(
        secret,
        transport({ status: true, data: {} }),
      ).createPayout(payout),
    ).rejects.toMatchObject({ code: 'invalid-response', uncertain: true });
  });
  it('rejects a provider rejection inside an HTTP success envelope', async () => {
    await expect(
      new PaystackProvider(
        secret,
        transport({ status: false, message: 'sensitive details' }),
      ).createCheckout(checkout),
    ).rejects.toThrow('Payment provider invalid-response');
  });
});

describe('authoritative payout lookup', () => {
  it('verifies the Paystack reference, exact amount and recipient, preserving reversals', async () => {
    const fetcher = transport({
      status: true,
      data: {
        transfer_code: 'TRF_example',
        reference: 'payout_0001',
        amount: 12345,
        currency: 'NGN',
        status: 'reversed',
        recipient: { recipient_code: 'RCP_example' },
      },
    });
    const p = new PaystackProvider(secret, fetcher);
    await expect(p.verifyPayout('payout_0001')).resolves.toEqual({
      id: 'TRF_example',
      reference: 'payout_0001',
      amount: 12345n,
      currency: 'NGN',
      status: 'reversed',
      recipientId: 'RCP_example',
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      'https://api.paystack.co/transfer/verify/payout_0001',
    );
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('GET');
  });
  it('does not treat a lookup outage as proof a payout failed', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 404 }));
    await expect(
      new PaystackProvider(secret, fetcher).verifyPayout('payout_0001'),
    ).rejects.toMatchObject({ code: 'http-error' });
  });
  it('checks Bachs by its persisted payout id and converts its net decimal amount exactly', async () => {
    const fetcher = transport({
      id: 'pay_example',
      reference: 'payout_0001',
      amount: '123.45',
      currency: 'NGN',
      destination: 'pd_example',
      status: 'completed',
    });
    const p = new BachsProvider(
      secret,
      signingSecret,
      'https://sandbox-api.bachs.io',
      fetcher,
    );
    await expect(p.verifyPayout('payout_0001', 'pay_example')).resolves.toEqual(
      {
        id: 'pay_example',
        reference: 'payout_0001',
        amount: 12345n,
        currency: 'NGN',
        recipientId: 'pd_example',
        status: 'succeeded',
      },
    );
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      'https://sandbox-api.bachs.io/v1/payouts/pay_example',
    );
    await expect(p.verifyPayout('payout_0001', null)).rejects.toMatchObject({
      code: 'unsupported',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('refuses missing destination evidence and unsafe numeric amounts', async () => {
    const invalid = transport({
      status: true,
      data: {
        transfer_code: 'TRF_example',
        reference: 'payout_0001',
        amount: Number.MAX_SAFE_INTEGER + 1,
        currency: 'NGN',
        status: 'success',
        recipient: { recipient_code: 'RCP_example' },
      },
    });
    await expect(
      new PaystackProvider(secret, invalid).verifyPayout('payout_0001'),
    ).rejects.toBeInstanceOf(PaymentProviderError);
    const missing = transport({
      id: 'pay_example',
      reference: 'payout_0001',
      amount: '123.45',
      currency: 'NGN',
      status: 'completed',
    });
    await expect(
      new BachsProvider(
        secret,
        signingSecret,
        'https://sandbox-api.bachs.io',
        missing,
      ).verifyPayout('payout_0001', 'pay_example'),
    ).rejects.toBeInstanceOf(PaymentProviderError);
  });
});
