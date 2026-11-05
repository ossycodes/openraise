import { z } from 'zod';
import type {
  AccountInput,
  CheckoutInput,
  PaymentProvider,
  PayoutInput,
  RefundInput,
  RecipientInput,
  WebhookHeaders,
  PaymentEventType,
  OperationStatus,
} from '../payment-provider.js';
import {
  input,
  PaymentProviderError,
  ProviderHttp,
  read,
} from '../provider-http.js';
import {
  accountInput,
  bankSchema,
  checkCheckout,
  checkoutUrl,
  currency,
  decimalAmount,
  header,
  majorAmount,
  matchesHmac,
  parseJson,
  payoutInput,
  recipientInput,
  refundInput,
  text,
} from '../provider-utils.js';

const eventTypes: Record<string, PaymentEventType> = {
  'collection.succeeded': 'payment.succeeded',
  'collection.failed': 'payment.failed',
  'checkout.expired': 'checkout.expired',
  'payout.paid': 'payout.succeeded',
  'payout.failed': 'payout.failed',
  'payout.created': 'payout.pending',
  'refund.paid': 'refund.succeeded',
  'refund.failed': 'refund.failed',
  'refund.created': 'refund.pending',
};
function operationStatus(status: string): OperationStatus {
  if (['completed', 'success', 'paid'].includes(status)) return 'succeeded';
  if (['failed', 'cancelled'].includes(status)) return 'failed';
  if (['pending', 'processing'].includes(status)) return 'pending';
  return 'unknown';
}
export class BachsProvider implements PaymentProvider {
  readonly name = 'bachs' as const;
  // OpenRaise's conservative NGN policy; Bachs can enforce additional account-specific limits.
  readonly minimumCheckout = { NGN: 100_000n, USD: 100n, GHS: 1n, KES: 1n };
  private readonly http: ProviderHttp;
  constructor(
    secret: string,
    private readonly webhookSecret: string,
    baseUrl = 'https://sandbox-api.bachs.io',
    transport: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    this.http = new ProviderHttp(baseUrl, secret, transport);
  }
  async createCheckout(value: CheckoutInput) {
    const data = checkCheckout(value, this.minimumCheckout);
    const result = read(
      z.object({
        checkout_id: text,
        checkout_url: checkoutUrl,
        reference: text,
      }),
      await this.http.request(
        '/v1/checkout-sessions',
        {
          pricing: {
            amount: majorAmount(data.amount),
            currency: data.currency,
          },
          customer: { email: data.email },
          reference: data.reference,
          success_url: data.successUrl,
          cancel_url: data.cancelUrl,
          metadata: data.metadata,
        },
        data.reference,
      ),
    );
    if (result.reference !== data.reference)
      throw new PaymentProviderError('invalid-response');
    return {
      id: result.checkout_id,
      reference: result.reference,
      url: result.checkout_url,
    };
  }
  async verifyPayment(identifier: string) {
    input(text, identifier);
    const session = read(
      z.object({
        checkout_id: text,
        reference: text.nullable(),
        status: text,
        amount: text,
        currency,
        charge: z.object({ payment_id: text }).nullable(),
      }),
      await this.http.request(
        `/v1/checkout-sessions/${encodeURIComponent(identifier)}`,
      ),
    );
    if (session.checkout_id !== identifier)
      throw new PaymentProviderError('invalid-response');
    // A completed checkout can be a card setup with no payment. Require a charge.
    if (!session.charge)
      return {
        id: session.checkout_id,
        reference: session.reference,
        amount: decimalAmount(session.amount, session.currency),
        currency: session.currency,
        status: ['expired', 'cancelled'].includes(session.status)
          ? ('failed' as const)
          : session.status === 'open'
            ? ('pending' as const)
            : ('unknown' as const),
      };
    const data = read(
      z.object({
        payment_id: text,
        reference: text.nullable(),
        status: text,
        amount: text,
        currency,
        amount_paid: text.nullish(),
      }),
      await this.http.request(
        `/v1/payments/${encodeURIComponent(session.charge.payment_id)}`,
      ),
    );
    if (
      data.payment_id !== session.charge.payment_id ||
      data.reference !== session.reference
    )
      throw new PaymentProviderError('invalid-response');
    const amount = decimalAmount(data.amount, data.currency);
    // Accepted/overpaid/underpaid require reconciliation and never mean exact settlement.
    const exactPaid =
      data.amount_paid != null &&
      decimalAmount(data.amount_paid, data.currency) === amount;
    const status =
      data.status === 'succeeded' && exactPaid
        ? ('succeeded' as const)
        : ['failed', 'expired', 'cancelled'].includes(data.status)
          ? ('failed' as const)
          : ['created', 'processing'].includes(data.status)
            ? ('pending' as const)
            : ['refunded', 'auto_refunded'].includes(data.status)
              ? ('refunded' as const)
              : ('unknown' as const);
    return {
      id: data.payment_id,
      reference: data.reference,
      amount,
      currency: data.currency,
      status,
    };
  }
  verifyWebhook(raw: Buffer, headers: WebhookHeaders) {
    const signature = header(headers, 'x-bachs-signature-v2');
    if (!signature) return false;
    const parts = signature.split(',').map((part) => part.trim().split('='));
    if (parts.some((part) => part.length !== 2)) return false;
    const timestamps = parts.filter(([key]) => key === 't');
    if (timestamps.length !== 1 || !/^\d+$/.test(timestamps[0]?.[1] ?? ''))
      return false;
    const timestamp = timestamps[0]![1]!;
    if (
      !Number.isSafeInteger(Number(timestamp)) ||
      Math.abs(this.now() / 1000 - Number(timestamp)) > 300
    )
      return false;
    const signed = Buffer.concat([Buffer.from(`${timestamp}.`), raw]);
    return parts.some(
      ([key, value, extra]) =>
        key === 'v1' &&
        !extra &&
        !!value &&
        matchesHmac('sha256', this.webhookSecret, signed, value),
    );
  }
  parseWebhook(raw: Buffer, headers: WebhookHeaders) {
    if (!this.verifyWebhook(raw, headers))
      throw new PaymentProviderError('invalid-signature');
    const event = read(
      z.object({ id: text, type: text, data: z.unknown() }),
      parseJson(raw),
    );
    const type = Object.hasOwn(eventTypes, event.type)
      ? eventTypes[event.type]
      : undefined;
    if (!type) return null;
    const base = { provider: this.name, id: event.id, type };
    if (type === 'payment.succeeded' || type === 'payment.failed') {
      const data = read(
        z.object({
          charge_id: text.nullable(),
          checkout_id: text.nullable(),
          reference: text.nullable(),
          status: text,
          amount: text,
          currency,
        }),
        event.data,
      );
      // Virtual-account deposits, test events without a charge and non-exact settlements
      // cannot safely identify and settle an OpenRaise donation.
      if (
        !data.charge_id ||
        !data.checkout_id ||
        !data.reference ||
        (type === 'payment.succeeded' && data.status !== 'SUCCEEDED')
      )
        return null;
      return {
        ...base,
        resourceId: data.charge_id,
        reference: data.reference,
        money: {
          amount: decimalAmount(data.amount, data.currency),
          currency: data.currency,
        },
      };
    }
    if (type.startsWith('payout.') && type !== 'payout.pending') {
      const data = read(
        z.object({
          withdrawal_id: text,
          reference: text.nullable(),
          amount: text,
          currency,
          from_currency: currency.nullish(),
          to_currency: currency.nullish(),
          to_amount: text.nullish(),
        }),
        event.data,
      );
      if (
        (data.from_currency && data.from_currency !== data.currency) ||
        (data.to_currency && data.to_currency !== data.currency)
      )
        throw new PaymentProviderError('unsupported');
      if (
        data.to_amount &&
        decimalAmount(data.to_amount, data.currency) !==
          decimalAmount(data.amount, data.currency)
      )
        throw new PaymentProviderError('invalid-response');
      return {
        ...base,
        resourceId: data.withdrawal_id,
        reference: data.reference,
        money: {
          amount: decimalAmount(data.amount, data.currency),
          currency: data.currency,
        },
      };
    }
    const data = read(
      z.object({
        reference: text.nullish(),
        checkout_id: text.optional(),
        withdrawal_id: text.optional(),
        refund_id: text.optional(),
      }),
      event.data,
    );
    const resourceId =
      type === 'checkout.expired'
        ? data.checkout_id
        : type.startsWith('payout.')
          ? data.withdrawal_id
          : data.refund_id;
    if (!resourceId) throw new PaymentProviderError('invalid-response');
    return { ...base, resourceId, reference: data.reference ?? null };
  }
  async listBanks(country: 'NG') {
    input(z.literal('NG'), country);
    return read(
      z.object({ banks: z.array(bankSchema) }),
      await this.http.request('/v1/reference/banks?country=NG'),
    ).banks;
  }
  async resolveAccount(value: AccountInput) {
    const data = input(accountInput, value);
    const result = read(
      z.object({
        resolved: z.boolean(),
        account_name: text.nullish(),
        account_number: text.nullish(),
      }),
      await this.http.request('/v1/misc/bank-accounts/resolve', {
        account_number: data.accountNumber,
        bank_code: data.bankCode,
        country: data.country,
      }),
    );
    if (!result.resolved) return { resolved: false as const };
    if (!result.account_name || !result.account_number)
      throw new PaymentProviderError('invalid-response');
    return {
      resolved: true as const,
      accountName: result.account_name,
      accountNumber: result.account_number,
    };
  }
  async createRecipient(value: RecipientInput) {
    const data = input(recipientInput, value);
    const result = read(
      z.object({ id: text, is_usable: z.boolean() }),
      await this.http.request(
        '/v1/payouts/destinations',
        {
          type: 'bank_account',
          currency: data.currency,
          name: data.accountName,
          account_name: data.accountName,
          account_number: data.accountNumber,
          bank_code: data.bankCode,
        },
        data.idempotencyKey,
      ),
    );
    return { id: result.id, usable: result.is_usable };
  }
  async createPayout(value: PayoutInput) {
    const data = input(payoutInput, value);
    // The destination determines the currency upstream. Check it before sending money.
    const destination = read(
      z.object({ currency, is_usable: z.boolean() }),
      await this.http.request(
        `/v1/payouts/destinations/${encodeURIComponent(data.recipientId)}`,
      ),
    );
    if (!destination.is_usable || destination.currency !== data.currency)
      throw new PaymentProviderError('unsupported');
    const result = read(
      z.object({ id: text, reference: text, status: text, currency }),
      await this.http.request(
        '/v1/payouts',
        {
          destination: data.recipientId,
          amount: majorAmount(data.amount),
          reference: data.reference,
          narration: data.reason,
        },
        data.reference,
      ),
    );
    if (
      result.reference !== data.reference ||
      result.currency !== data.currency
    )
      throw new PaymentProviderError('invalid-response');
    return {
      id: result.id,
      reference: result.reference,
      status: operationStatus(result.status),
    };
  }
  async refund(value: RefundInput) {
    const data = input(refundInput, value);
    // Currency is the original settlement currency, supplied from the caller's
    // reconciled payment record. Bachs has no currency field on refund creation.
    const result = read(
      z.object({
        refund_id: text,
        reference: text,
        status: text,
        requested_amount: text,
      }),
      await this.http.request(
        '/v1/refunds',
        {
          charge_id: data.paymentId,
          reference: data.reference,
          amount: majorAmount(data.amount),
          fee_bearer: 'org',
          reason: data.reason,
          idempotency_key: data.reference,
        },
        data.reference,
      ),
    );
    if (
      result.reference !== data.reference ||
      decimalAmount(result.requested_amount, data.currency) !== data.amount
    )
      throw new PaymentProviderError('invalid-response');
    return {
      id: result.refund_id,
      reference: result.reference,
      status: operationStatus(result.status),
    };
  }
}
