import { validateEnv } from './env.js';

describe('validateEnv', () => {
  it('applies defaults', () => {
    expect(validateEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      WEB_URL: 'http://localhost:3000',
      DEFAULT_CURRENCY: 'NGN',
      PLATFORM_FEE_BPS: 350,
      DONOR_FEE_BPS: 150,
      DONOR_FLAT_FEE: 10_000n,
      DONOR_FLAT_FEE_THRESHOLD: 250_000n,
      WITHDRAWAL_FEE: 5_000n,
    });
  });

  it('reads fees as integers and BigInt minor units', () => {
    const env = validateEnv({ PLATFORM_FEE_BPS: '0', WITHDRAWAL_FEE: '2500' });
    expect(env.PLATFORM_FEE_BPS).toBe(0);
    expect(env.WITHDRAWAL_FEE).toBe(2_500n);
  });

  it('rejects out-of-range fees and unknown currencies', () => {
    expect(() => validateEnv({ PLATFORM_FEE_BPS: '10001' })).toThrow(
      /PLATFORM_FEE_BPS/,
    );
    expect(() => validateEnv({ WITHDRAWAL_FEE: '-1' })).toThrow(
      /WITHDRAWAL_FEE/,
    );
    expect(() => validateEnv({ DEFAULT_CURRENCY: 'EUR' })).toThrow(
      /DEFAULT_CURRENCY/,
    );
  });

  it('coerces PORT from a string', () => {
    expect(validateEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('names the bad variable in the error', () => {
    expect(() => validateEnv({ WEB_URL: 'not a url' })).toThrow(/WEB_URL/);
  });
});
