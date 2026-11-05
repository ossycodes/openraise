import { validateEnv } from './env.js';

const required = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/openraise',
  JWT_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults', () => {
    expect(validateEnv(required)).toEqual({
      ...required,
      NODE_ENV: 'development',
      PORT: 4000,
      WEB_URL: 'http://localhost:3000',
      JWT_ACCESS_TTL: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
      SMTP_URL: 'smtp://localhost:1025',
      MAIL_FROM: 'OpenRaise <no-reply@openraise.local>',
      DEFAULT_CURRENCY: 'NGN',
      PLATFORM_FEE_BPS: 350,
      DONOR_FEE_BPS: 150,
      DONOR_FLAT_FEE: 10_000n,
      DONOR_FLAT_FEE_THRESHOLD: 250_000n,
      WITHDRAWAL_FEE: 5_000n,
    });
  });

  it('coerces PORT from a string', () => {
    expect(validateEnv({ ...required, PORT: '8080' }).PORT).toBe(8080);
  });

  it('names the bad variable in the error', () => {
    expect(() => validateEnv({ ...required, WEB_URL: 'not a url' })).toThrow(
      /WEB_URL/,
    );
  });

  it('requires a database URL and a long JWT secret', () => {
    expect(() => validateEnv({ ...required, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    );
    expect(() => validateEnv({ ...required, DATABASE_URL: 'mysql://x' })).toThrow(
      /DATABASE_URL/,
    );
    expect(() => validateEnv({ ...required, JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('reads fees as integers and BigInt minor units', () => {
    const env = validateEnv({
      ...required,
      PLATFORM_FEE_BPS: '0',
      WITHDRAWAL_FEE: '2500',
    });
    expect(env.PLATFORM_FEE_BPS).toBe(0);
    expect(env.WITHDRAWAL_FEE).toBe(2_500n);
  });

  it('rejects out-of-range fees and unknown currencies', () => {
    expect(() =>
      validateEnv({ ...required, PLATFORM_FEE_BPS: '10001' }),
    ).toThrow(/PLATFORM_FEE_BPS/);
    expect(() => validateEnv({ ...required, WITHDRAWAL_FEE: '-1' })).toThrow(
      /WITHDRAWAL_FEE/,
    );
    expect(() =>
      validateEnv({ ...required, DEFAULT_CURRENCY: 'EUR' }),
    ).toThrow(/DEFAULT_CURRENCY/);
  });
});
