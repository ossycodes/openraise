import 'server-only';
import { formatMoney, isCurrency } from '@openraise/shared';
import { apiOrigin } from './campaign-server';

/** A public API read for content pages: null instead of throwing. */
export async function readPublic<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${apiOrigin()}${path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export interface Category {
  slug: string;
  name: string;
  description: string;
}

export interface FeeConfig {
  currency: string;
  platformFeeBps: number;
  donorFeeBps: number;
  donorFlatFee: string;
  donorFlatFeeThreshold: string;
  withdrawalFee: string;
}

const percent = (bps: number) => `${(bps / 100).toLocaleString('en-GB')}%`;

/**
 * The deployment's fees in plain sentences, from GET /config/fees, so guides
 * and FAQs never quote a number this deployment doesn't charge.
 */
export function feeSentences(fees: FeeConfig): string[] {
  const currency = isCurrency(fees.currency) ? fees.currency : 'NGN';
  const money = (minor: string) => formatMoney(BigInt(minor), currency);
  const flat = BigInt(fees.donorFlatFee) > 0n;
  return [
    `A platform fee of ${percent(fees.platformFeeBps)} comes out of each gift, unless the donor chooses to cover it.`,
    `Donors pay a payment processing fee of ${percent(fees.donorFeeBps)}${
      flat
        ? `, plus ${money(fees.donorFlatFee)} on gifts over ${money(fees.donorFlatFeeThreshold)}`
        : ''
    }, shown before they pay.`,
    `Each withdrawal to your bank account costs ${money(fees.withdrawalFee)}.`,
  ];
}

/** Inline JSON-LD, with "<" escaped so text can't close the script tag. */
export const jsonLd = (data: unknown) => ({
  __html: JSON.stringify(data).replace(/</g, '\\u003c'),
});
