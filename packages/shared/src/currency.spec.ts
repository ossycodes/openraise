import { describe, expect, it } from 'vitest';
import { isCurrency, MINOR_UNITS, SUPPORTED_CURRENCIES } from './currency.js';

describe('currency', () => {
  it('recognises supported currencies', () => {
    for (const c of SUPPORTED_CURRENCIES) expect(isCurrency(c)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isCurrency('EUR')).toBe(false);
    expect(isCurrency('ngn')).toBe(false);
    expect(isCurrency(100)).toBe(false);
    expect(isCurrency(undefined)).toBe(false);
  });

  it('defines minor units for every supported currency', () => {
    for (const c of SUPPORTED_CURRENCIES) expect(MINOR_UNITS[c]).toBe(100);
  });
});
