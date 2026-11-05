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
  checkedAmount,
  currency,
  header,
  matchesHmac,
  minorAmount,
  parseJson,
  payoutInput,
  providerId,
  recipientInput,
  refundInput,
  text,
} from '../provider-utils.js';

const envelope = z.object({ status: z.literal(true), data: z.unknown() });
const payment = z.object({
  id: providerId,
  reference: text,
  status: text,
  amount: minorAmount,
  currency,
});
const operation = z.object({ reference: text, status: text });
function operationStatus(status: string): OperationStatus {
  if (['success', 'processed'].includes(status)) return 'succeeded';
  if (['failed', 'reversed'].includes(status)) return 'failed';
  if (['pending', 'processing', 'received', 'otp'].includes(status))
    return 'pending';
  return 'unknown';
}
const eventTypes: Record<string, PaymentEventType> = {
  'charge.success': 'payment.succeeded',
  'transfer.success': 'payout.succeeded',
  'transfer.failed': 'payout.failed',
  'transfer.reversed': 'payout.reversed',
  'refund.processed': 'refund.succeeded',
  'refund.failed': 'refund.failed',
  'refund.pending': 'refund.pending',
  'refund.processing': 'refund.pending',
};

export class PaystackProvider implements PaymentProvider {
  readonly name = 'paystack' as const;
  readonly minimumCheckout = { NGN: 5_000n, USD: 200n, GHS: 10n, KES: 300n };
  private readonly http: ProviderHttp;
  constructor(
    private readonly secret: string,
    transport: typeof fetch = fetch,
  ) {
    this.http = new ProviderHttp('https://api.paystack.co', secret, transport);
  }
  private async request(path: string, body?: unknown) {
    const response = await this.http.request(path, body);
    const parsed = envelope.safeParse(response);
    if (!parsed.success)
      throw new PaymentProviderError(
        'invalid-response',
        undefined,
        body !== undefined,
      );
    return parsed.data.data;
  }
  async createCheckout(value: CheckoutInput) {
    const data = checkCheckout(value, this.minimumCheckout);
    const result = read(
      z.object({
        authorization_url: checkoutUrl,
        access_code: text,
        reference: text,
      }),
      await this.request('/transaction/initialize', {
        email: data.email,
        amount: checkedAmount(data.amount),
        currency: data.currency,
        reference: data.reference,
        callback_url: data.successUrl,
        metadata: { ...data.metadata, cancel_action: data.cancelUrl },
      }),
    );
    if (result.reference !== data.reference)
      throw new PaymentProviderError('invalid-response');
    return {
      id: result.reference,
      reference: result.reference,
      url: result.authorization_url,
    };
  }
  async verifyPayment(identifier: string) {
    input(text, identifier);
    const data = read(
      payment,
      await this.request(
        `/transaction/verify/${encodeURIComponent(identifier)}`,
      ),
    );
    if (data.reference !== identifier)
      throw new PaymentProviderError('invalid-response');
    const status =
      data.status === 'success'
        ? ('succeeded' as const)
        : ['failed', 'abandoned', 'reversed'].includes(data.status)
          ? ('failed' as const)
          : ['pending', 'ongoing', 'processing', 'queued'].includes(data.status)
            ? ('pending' as const)
            : ('unknown' as const);
    return {
      id: data.id,
      reference: data.reference,
      amount: data.amount,
      currency: data.currency,
      status,
    };
  }
  verifyWebhook(raw: Buffer, headers: WebhookHeaders) {
    const signature = header(headers, 'x-paystack-signature');
    return !!signature && matchesHmac('sha512', this.secret, raw, signature);
  }
  parseWebhook(raw: Buffer, headers: WebhookHeaders) {
    if (!this.verifyWebhook(raw, headers))
      throw new PaymentProviderError('invalid-signature');
    const event = read(
      z.object({ event: text, data: z.unknown() }),
      parseJson(raw),
    );
    const type = Object.hasOwn(eventTypes, event.event)
      ? eventTypes[event.event]
      : undefined;
    if (!type) return null;
    if (type === 'payment.succeeded') {
      const data = read(payment, event.data);
      if (data.status !== 'success')
        throw new PaymentProviderError('invalid-response');
      return {
        provider: this.name,
        id: `${event.event}:${data.id}`,
        type,
        resourceId: data.id,
        reference: data.reference,
        money: { amount: data.amount, currency: data.currency },
      };
    }
    if (type.startsWith('payout.')) {
      const data = read(
        z.object({
          id: providerId,
          transfer_code: text,
          reference: text,
          amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
          currency: currency,
        }),
        event.data,
      );
      return {
        provider: this.name,
        id: `${event.event}:${data.id}`,
        type,
        resourceId: data.transfer_code,
        reference: data.reference,
        money: { amount: BigInt(data.amount), currency: data.currency },
      };
    }
    // Paystack has no top-level event id. Event type + resource id is stable across retries
    // while keeping pending, failed, reversed and succeeded notifications distinct.
    const data = read(
      z.object({
        id: providerId,
        reference: text.nullish(),
        transfer_code: text.optional(),
      }),
      event.data,
    );
    return {
      provider: this.name,
      id: `${event.event}:${data.id}`,
      type,
      resourceId: data.transfer_code ?? data.id,
      reference: data.reference ?? null,
    };
  }
  async listBanks(country: 'NG') {
    input(z.literal('NG'), country);
    // use_cursor returns all banks unless a next cursor is supplied; follow every page.
    const banks = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const query = new URLSearchParams({
        country: 'nigeria',
        currency: 'NGN',
        perPage: '100',
        use_cursor: 'true',
      });
      if (cursor) query.set('next', cursor);
      const response = await this.http.request(`/bank?${query}`);
      const page = read(
        z.object({
          status: z.literal(true),
          data: z.array(bankSchema),
          meta: z.object({ next: z.string().nullish() }).optional(),
        }),
        response,
      );
      banks.push(...page.data);
      cursor = page.meta?.next || undefined;
      if (cursor && seen.has(cursor))
        throw new PaymentProviderError('invalid-response');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return banks;
  }
  async resolveAccount(value: AccountInput) {
    const data = input(accountInput, value);
    const query = new URLSearchParams({
      account_number: data.accountNumber,
      bank_code: data.bankCode,
    });
    const result = read(
      z.object({ account_number: text, account_name: text }),
      await this.request(`/bank/resolve?${query}`),
    );
    return {
      resolved: true as const,
      accountNumber: result.account_number,
      accountName: result.account_name,
    };
  }
  async createRecipient(value: RecipientInput) {
    const data = input(recipientInput, value);
    const result = read(
      z.object({ recipient_code: text, active: z.boolean() }),
      await this.request('/transferrecipient', {
        type: 'nuban',
        name: data.accountName,
        account_number: data.accountNumber,
        bank_code: data.bankCode,
        currency: data.currency,
      }),
    );
    return { id: result.recipient_code, usable: result.active };
  }
  async createPayout(value: PayoutInput) {
    const data = input(payoutInput, value);
    const result = read(
      operation.extend({ transfer_code: text }),
      await this.request('/transfer', {
        source: 'balance',
        amount: checkedAmount(data.amount),
        currency: data.currency,
        recipient: data.recipientId,
        reference: data.reference,
        reason: data.reason,
      }),
    );
    if (result.reference !== data.reference)
      throw new PaymentProviderError('invalid-response');
    return {
      id: result.transfer_code,
      reference: result.reference,
      status: operationStatus(result.status),
    };
  }
  async refund(value: RefundInput) {
    const data = input(refundInput, value);
    const result = read(
      z.object({ id: providerId, status: text, reference: text.optional() }),
      await this.request('/refund', {
        transaction: data.paymentId,
        amount: checkedAmount(data.amount),
        currency: data.currency,
        reference: data.reference,
        merchant_note: data.reason,
      }),
    );
    if (result.reference && result.reference !== data.reference)
      throw new PaymentProviderError('invalid-response');
    return {
      id: result.id,
      reference: data.reference,
      status: operationStatus(result.status),
    };
  }
}
