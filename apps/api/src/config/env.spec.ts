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
      SITE_NAME: 'OpenRaise',
      STORAGE_ENDPOINT: 'http://localhost:8333',
      STORAGE_REGION: 'us-east-1',
      STORAGE_BUCKET: 'openraise',
      STORAGE_ACCESS_KEY_ID: 'openraise',
      STORAGE_SECRET_ACCESS_KEY: 'openraise-secret',
      STORAGE_FORCE_PATH_STYLE: true,
      STORAGE_PUBLIC_URL: 'http://localhost:8333/openraise',
      STORAGE_CREATE_BUCKET: true,

      REDIS_URL: 'redis://localhost:6379',
      PAYMENT_QUEUE_PREFIX: 'openraise',
      RATE_LIMIT_ENABLED: true,
      RATE_LIMIT_PREFIX: 'openraise-rate',
      RATE_LIMIT_WINDOW_SECONDS: 60,
      RATE_LIMIT_TRUSTED_PROXIES: '',
      RATE_LIMIT_AUTH_MAX: 10,
      RATE_LIMIT_SIGNUP_MAX: 5,
      RATE_LIMIT_RECOVERY_MAX: 5,
      RATE_LIMIT_REFRESH_MAX: 120,
      RATE_LIMIT_CHECKOUT_MAX: 30,
      RATE_LIMIT_REPORT_MAX: 5,
      RATE_LIMIT_UPLOAD_MAX: 10,
      RATE_LIMIT_AI_MAX: 10,
      PAYMENT_PROVIDER: 'disabled',
      BACHS_BASE_URL: 'https://sandbox-api.bachs.io',
      KYC_PROVIDER: 'manual',
      QOREID_BASE_URL: 'https://api.qoreid.com',
      DOJAH_BASE_URL: 'https://sandbox.dojah.io',
      SMILE_BASE_URL: 'https://testapi.smileidentity.com',
      KYC_DOCUMENT_RETENTION_DAYS: 365,
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
    expect(() =>
      validateEnv({ ...required, DATABASE_URL: 'mysql://x' }),
    ).toThrow(/DATABASE_URL/);
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
    expect(() => validateEnv({ ...required, DEFAULT_CURRENCY: 'EUR' })).toThrow(
      /DEFAULT_CURRENCY/,
    );
  });
});

describe('payment provider configuration', () => {
  it('only requires credentials for the selected provider', () => {
    expect(validateEnv(required).PAYMENT_PROVIDER).toBe('disabled');
    expect(() =>
      validateEnv({ ...required, PAYMENT_PROVIDER: 'paystack' }),
    ).toThrow(/PAYSTACK_SECRET_KEY/);
    expect(
      validateEnv({
        ...required,
        PAYMENT_PROVIDER: 'paystack',
        PAYSTACK_SECRET_KEY: 'sk_test_example',
      }).PAYMENT_PROVIDER,
    ).toBe('paystack');
    expect(() =>
      validateEnv({
        ...required,
        PAYMENT_PROVIDER: 'bachs',
        BACHS_SECRET_KEY: 'sk_sandbox_example',
      }),
    ).toThrow(/BACHS_WEBHOOK_SECRET/);
    expect(() =>
      validateEnv({
        ...required,
        PAYMENT_PROVIDER: 'paystack',
        PAYSTACK_SECRET_KEY: '  ',
      }),
    ).toThrow(/PAYSTACK_SECRET_KEY/);
  });
  it('only requires KYC credentials for the selected provider', () => {
    expect(validateEnv(required).KYC_PROVIDER).toBe('manual');
    expect(() => validateEnv({ ...required, KYC_PROVIDER: 'dojah' })).toThrow(
      /DOJAH_APP_ID/,
    );
    expect(() =>
      validateEnv({
        ...required,
        KYC_PROVIDER: 'qoreid',
        QOREID_CLIENT_ID: 'c',
      }),
    ).toThrow(/QOREID_SECRET/);
    expect(() =>
      validateEnv({
        ...required,
        KYC_PROVIDER: 'smile',
        SMILE_PARTNER_ID: 'p',
      }),
    ).toThrow(/SMILE_API_KEY/);
    expect(
      validateEnv({
        ...required,
        KYC_PROVIDER: 'dojah',
        DOJAH_APP_ID: 'a',
        DOJAH_SECRET_KEY: 's',
      }).KYC_PROVIDER,
    ).toBe('dojah');
    expect(() =>
      validateEnv({ ...required, DOJAH_BASE_URL: 'https://example.com' }),
    ).toThrow(/DOJAH_BASE_URL/);
  });
  it('requires secure callback and privacy notice URLs for Smile', () => {
    const smile = {
      ...required,
      KYC_PROVIDER: 'smile',
      SMILE_PARTNER_ID: '1234',
      SMILE_API_KEY: 'key',
    };
    expect(() => validateEnv(smile)).toThrow(/SMILE_CALLBACK_URL/);
    expect(() =>
      validateEnv({
        ...smile,
        SMILE_CALLBACK_URL: 'https://example.com/webhooks/kyc/smile',
      }),
    ).toThrow(/SMILE_PRIVACY_POLICY_URL/);
    expect(() =>
      validateEnv({
        ...smile,
        SMILE_CALLBACK_URL: 'http://example.com/webhooks/kyc/smile',
        SMILE_PRIVACY_POLICY_URL: 'https://example.com/privacy',
      }),
    ).toThrow(/SMILE_CALLBACK_URL/);
    expect(
      validateEnv({
        ...smile,
        SMILE_CALLBACK_URL: 'https://example.com/webhooks/kyc/smile',
        SMILE_PRIVACY_POLICY_URL: 'https://example.com/privacy',
      }).KYC_PROVIDER,
    ).toBe('smile');
  });
  it('rejects unknown providers, untrusted Bachs origins and key/environment mismatches', () => {
    expect(() =>
      validateEnv({ ...required, PAYMENT_PROVIDER: 'other' }),
    ).toThrow(/PAYMENT_PROVIDER/);
    expect(() =>
      validateEnv({ ...required, BACHS_BASE_URL: 'https://example.com' }),
    ).toThrow(/BACHS_BASE_URL/);
    expect(() =>
      validateEnv({
        ...required,
        PAYMENT_PROVIDER: 'bachs',
        BACHS_SECRET_KEY: 'sk_live_example',
        BACHS_WEBHOOK_SECRET: 'whsec_example',
      }),
    ).toThrow(/BACHS_BASE_URL/);
    expect(
      validateEnv({
        ...required,
        PAYMENT_PROVIDER: 'bachs',
        BACHS_SECRET_KEY: 'sk_live_example',
        BACHS_WEBHOOK_SECRET: 'whsec_example',
        BACHS_BASE_URL: 'https://api.bachs.io',
      }).PAYMENT_PROVIDER,
    ).toBe('bachs');
  });
});
