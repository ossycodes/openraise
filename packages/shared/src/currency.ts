/**
 * Currencies OpenRaise can hold. Amounts are always integers in the
 * currency's minor unit (kobo, pesewas, cents) — see docs/Decisions.md.
 */
export const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GHS', 'KES'] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

/** Minor units per major unit (100 kobo = ₦1). */
export const MINOR_UNITS: Record<Currency, number> = {
  NGN: 100,
  USD: 100,
  GHS: 100,
  KES: 100,
};

export function isCurrency(value: unknown): value is Currency {
  return (
    typeof value === 'string' &&
    (SUPPORTED_CURRENCIES as readonly string[]).includes(value)
  );
}
