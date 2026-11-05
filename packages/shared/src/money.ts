import { MINOR_UNITS, type Currency } from './currency.js';

const DIGITS: Record<number, number> = { 1: 0, 10: 1, 100: 2, 1000: 3 };

function fractionDigits(currency: Currency): number {
  const digits = DIGITS[MINOR_UNITS[currency]];
  if (digits === undefined) throw new Error(`Unsupported minor unit for ${currency}`);
  return digits;
}

/**
 * Format minor units for display, e.g. 150050n NGN -> "₦1,500.50".
 * Formats from an exact decimal string, so large amounts never lose
 * precision through a float.
 */
export function formatMoney(
  minor: bigint,
  currency: Currency,
  locale = 'en-NG',
): string {
  const digits = fractionDigits(currency);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const unit = BigInt(MINOR_UNITS[currency]);
  const whole = (abs / unit).toString();
  const frac = (abs % unit).toString().padStart(digits, '0');
  const decimal = `${negative ? '-' : ''}${whole}${digits ? `.${frac}` : ''}`;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    // Intl accepts exact decimal strings; the cast is for older lib typings.
  }).format(decimal as unknown as number);
}

/**
 * Parse a user-typed amount in major units ("1,500.5", "2000") into minor
 * units. Rejects negatives, more decimals than the currency allows, and junk.
 */
export function toMinorUnits(input: string, currency: Currency): bigint {
  const digits = fractionDigits(currency);
  const cleaned = input.trim().replace(/,/g, '');
  const match = /^(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) throw new RangeError(`Not a valid amount: "${input}"`);

  const [, whole = '0', frac = ''] = match;
  if (frac.length > digits) {
    throw new RangeError(`At most ${digits} decimal places for ${currency}`);
  }
  const unit = BigInt(MINOR_UNITS[currency]);
  return BigInt(whole) * unit + BigInt(frac.padEnd(digits, '0') || '0');
}
