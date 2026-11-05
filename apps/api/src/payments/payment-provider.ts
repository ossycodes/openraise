import type { Currency } from '@openraise/shared';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
export type ProviderName = 'paystack' | 'bachs';
export type PaymentStatus =
  'pending' | 'succeeded' | 'failed' | 'refunded' | 'unknown';
export type OperationStatus = 'pending' | 'succeeded' | 'failed' | 'unknown';
export type WebhookHeaders = Readonly<
  Record<string, string | string[] | undefined>
>;
export interface Money {
  amount: bigint;
  currency: Currency;
}
export interface CheckoutInput extends Money {
  reference: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}
export interface Checkout {
  id: string;
  reference: string;
  url: string;
}
export interface VerifiedPayment extends Money {
  id: string;
  reference: string | null;
  status: PaymentStatus;
}
export interface Bank {
  code: string;
  name: string;
}
export interface AccountInput {
  accountNumber: string;
  bankCode: string;
  country: 'NG';
}
export type ResolvedAccount =
  | { resolved: true; accountNumber: string; accountName: string }
  | { resolved: false };
export interface RecipientInput extends AccountInput {
  accountName: string;
  currency: 'NGN';
  idempotencyKey: string;
}
export interface Recipient {
  id: string;
  usable: boolean;
}
export interface PayoutInput extends Money {
  recipientId: string;
  reference: string;
  reason?: string;
}
/** Bachs amounts/currency must come from the reconciled settlement record, not checkout FX. */
export interface RefundInput extends Money {
  paymentId: string;
  reference: string;
  reason?: string;
}
export interface Operation {
  id: string;
  reference: string;
  status: OperationStatus;
}
export type PaymentEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'checkout.expired'
  | 'payout.succeeded'
  | 'payout.failed'
  | 'payout.pending'
  | 'refund.succeeded'
  | 'refund.failed'
  | 'refund.pending';
export interface ProviderEvent {
  provider: ProviderName;
  id: string;
  type: PaymentEventType;
  resourceId: string;
  reference: string | null;
  /** Present for payment events; refunds may omit currency upstream. */
  money?: Money;
}

/** Does not persist donations, process events or post ledger entries. */
export interface PaymentProvider {
  readonly name: ProviderName;
  readonly minimumCheckout: Readonly<Record<Currency, bigint>>;
  createCheckout(input: CheckoutInput): Promise<Checkout>;
  /** Paystack takes a merchant reference; Bachs takes the returned checkout id. */
  verifyPayment(identifier: string): Promise<VerifiedPayment>;
  verifyWebhook(raw: Buffer, headers: WebhookHeaders): boolean;
  /** Verifies again before parsing. Unknown events return null. */
  parseWebhook(raw: Buffer, headers: WebhookHeaders): ProviderEvent | null;
  listBanks(country: 'NG'): Promise<Bank[]>;
  resolveAccount(input: AccountInput): Promise<ResolvedAccount>;
  createRecipient(input: RecipientInput): Promise<Recipient>;
  createPayout(input: PayoutInput): Promise<Operation>;
  refund(input: RefundInput): Promise<Operation>;
}
