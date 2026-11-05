import { describe, expect, it } from 'vitest';
import { formatMoney, toMinorUnits } from './money.js';

describe('formatMoney', () => {
  it('formats naira with the symbol and two decimals', () => {
    expect(formatMoney(150_050n, 'NGN')).toBe('₦1,500.50');
  });

  it('formats dollars', () => {
    expect(formatMoney(25_000n, 'USD', 'en-US')).toBe('$250.00');
  });

  it('keeps precision beyond Number.MAX_SAFE_INTEGER', () => {
    // ₦90,071,992,547,409.93: one kobo past what a float can hold exactly
    expect(formatMoney(9_007_199_254_740_993n, 'NGN')).toBe(
      '₦90,071,992,547,409.93',
    );
  });

  it('formats negatives', () => {
    expect(formatMoney(-5_000n, 'NGN')).toBe('-₦50.00');
  });
});

describe('toMinorUnits', () => {
  it('parses whole and decimal amounts', () => {
    expect(toMinorUnits('2000', 'NGN')).toBe(200_000n);
    expect(toMinorUnits('1,500.5', 'NGN')).toBe(150_050n);
    expect(toMinorUnits(' 0.07 ', 'USD')).toBe(7n);
  });

  it('rejects too many decimals, negatives and junk', () => {
    expect(() => toMinorUnits('1.005', 'NGN')).toThrow(RangeError);
    expect(() => toMinorUnits('-10', 'NGN')).toThrow(RangeError);
    expect(() => toMinorUnits('ten', 'NGN')).toThrow(RangeError);
    expect(() => toMinorUnits('', 'NGN')).toThrow(RangeError);
  });

  it('round-trips with formatMoney', () => {
    expect(formatMoney(toMinorUnits('48,250', 'NGN'), 'NGN')).toBe(
      '₦48,250.00',
    );
  });
});
