import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  SUPPORTED_CURRENCIES,
  toMinorUnits,
  type Currency,
} from '@openraise/shared';
import { z } from 'zod';
import { input, PaymentProviderError } from './provider-http.js';
import type { WebhookHeaders } from './payment-provider.js';

export const text = z.string().min(1);
export const checkoutUrl = z
  .url()
  .refine((value) => new URL(value).protocol === 'https:');
const redirectUrl = z
  .url()
  .refine((value) => ['https:', 'http:'].includes(new URL(value).protocol));
export const currency = z.enum(SUPPORTED_CURRENCIES);
// Provider JSON numbers must be safe: rounded amounts/ids must never reach the ledger.
export const providerId = z
  .union([text, z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)])
  .transform(String);
export const minorAmount = z
  .union([
    z.string().regex(/^\d+$/),
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ])
  .transform(BigInt);
export const reference = z.string().regex(/^[a-z0-9_-]{8,64}$/);
export const moneyInput = z.object({ amount: z.bigint().positive(), currency });
export const checkoutInput = moneyInput.extend({
  reference,
  email: z.email(),
  successUrl: redirectUrl,
  cancelUrl: redirectUrl,
  metadata: z.record(z.string(), z.string()).optional(),
});
export const accountInput = z.object({
  country: z.literal('NG'),
  bankCode: z.string().regex(/^\d+$/),
  accountNumber: z.string().regex(/^\d{10}$/),
});
export const recipientInput = accountInput.extend({
  currency: z.literal('NGN'),
  accountName: text,
  idempotencyKey: reference,
});
export const payoutInput = moneyInput.extend({
  currency: z.literal('NGN'),
  recipientId: text,
  reference,
  reason: z.string().max(100).optional(),
});
export const refundInput = moneyInput.extend({
  paymentId: text,
  reference,
  reason: z.string().max(500).optional(),
});
export const bankSchema = z.object({ code: text, name: text });

export function decimalAmount(value: unknown, code: Currency): bigint {
  if (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value))
    throw new PaymentProviderError('invalid-response');
  return toMinorUnits(value, code);
}
export function majorAmount(amount: bigint): string {
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`;
}
export function checkedAmount(amount: bigint): number {
  if (amount > BigInt(Number.MAX_SAFE_INTEGER))
    throw new PaymentProviderError('invalid-input');
  return Number(amount);
}
export function checkCheckout(
  value: unknown,
  minimum: Readonly<Record<Currency, bigint>>,
) {
  const data = input(checkoutInput, value);
  if (data.amount < minimum[data.currency])
    throw new PaymentProviderError('invalid-input');
  return data;
}
export function header(
  headers: WebhookHeaders,
  name: string,
): string | undefined {
  const matches = Object.entries(headers).filter(
    ([key]) => key.toLowerCase() === name,
  );
  if (matches.length !== 1 || typeof matches[0]?.[1] !== 'string')
    return undefined;
  return matches[0][1];
}
export function matchesHmac(
  algorithm: string,
  secret: string,
  raw: Buffer,
  signature: string,
): boolean {
  const expected = createHmac(algorithm, secret).update(raw).digest();
  if (!new RegExp(`^[a-fA-F0-9]{${expected.length * 2}}$`).test(signature))
    return false;
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
export function parseJson(raw: Buffer): unknown {
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new PaymentProviderError('invalid-response');
  }
}
