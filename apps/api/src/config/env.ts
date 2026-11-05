import { DEFAULT_FEE_CONFIG, SUPPORTED_CURRENCIES } from '@openraise/shared';
import { z } from 'zod';

const bps = z.coerce.number().int().min(0).max(10_000);
const minorUnits = z.coerce.bigint().nonnegative();

/**
 * Every environment variable the API reads, validated once at boot.
 * Keep in sync with .env.example.
 */
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    WEB_URL: z.url().default('http://localhost:3000'),

    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'Must be a postgres:// connection URL'),

    // Auth
    JWT_SECRET: z.string().min(32, 'Use at least 32 random characters'),
    /** Access token lifetime in seconds */
    JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    // Email
    SMTP_URL: z.string().default('smtp://localhost:1025'),
    MAIL_FROM: z.string().default('OpenRaise <no-reply@openraise.local>'),

    // Branding: each deployment's own name and look (published at GET /config/site)
    SITE_NAME: z.string().trim().min(1).max(60).default('OpenRaise'),
    SITE_LOGO_URL: z.url().optional(),
    SITE_PRIMARY_COLOR: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #1e5b43')
      .optional(),
    SITE_SUPPORT_EMAIL: z.email().optional(),

    // Google sign-in: the OAuth client ID (Web application). Unset = disabled.
    // Empty (a placeholder line in .env) counts as unset.
    GOOGLE_CLIENT_ID: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || undefined),

    // Storage: any S3-compatible service. Defaults match docker-compose (SeaweedFS).
    /** Empty for AWS S3; the R2/SeaweedFS/MinIO endpoint otherwise */
    STORAGE_ENDPOINT: z.string().default('http://localhost:8333'),
    STORAGE_REGION: z.string().min(1).default('us-east-1'),
    STORAGE_BUCKET: z.string().min(1).default('openraise'),
    STORAGE_ACCESS_KEY_ID: z.string().default('openraise'),
    STORAGE_SECRET_ACCESS_KEY: z.string().default('openraise-secret'),
    STORAGE_FORCE_PATH_STYLE: z.stringbool().default(true),
    /** Where browsers fetch stored files: a CDN or the bucket's public URL */
    STORAGE_PUBLIC_URL: z.url().default('http://localhost:8333/openraise'),
    /** Create the bucket at boot if missing (handy locally; off in production) */
    STORAGE_CREATE_BUCKET: z.stringbool().default(true),

    REDIS_URL: z
      .url()
      .refine((value) =>
        ['redis:', 'rediss:'].includes(new URL(value).protocol),
      )
      .default('redis://localhost:6379'),
    PAYMENT_QUEUE_PREFIX: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .default('openraise'),

    // Payments are opt-in: existing development installs need no provider account.
    PAYMENT_PROVIDER: z
      .enum(['disabled', 'paystack', 'bachs'])
      .default('disabled'),
    PAYSTACK_SECRET_KEY: z.string().optional(),
    BACHS_SECRET_KEY: z.string().optional(),
    BACHS_WEBHOOK_SECRET: z.string().optional(),
    BACHS_BASE_URL: z
      .enum(['https://sandbox-api.bachs.io', 'https://api.bachs.io'])
      .default('https://sandbox-api.bachs.io'),

    // Fees (see docs/Features/Fee engine.md). Amounts are minor units.
    DEFAULT_CURRENCY: z.enum(SUPPORTED_CURRENCIES).default('NGN'),
    PLATFORM_FEE_BPS: bps.default(DEFAULT_FEE_CONFIG.platformFeeBps),
    DONOR_FEE_BPS: bps.default(DEFAULT_FEE_CONFIG.donorFeeBps),
    DONOR_FLAT_FEE: minorUnits.default(DEFAULT_FEE_CONFIG.donorFlatFee),
    DONOR_FLAT_FEE_THRESHOLD: minorUnits.default(
      DEFAULT_FEE_CONFIG.donorFlatFeeThreshold,
    ),
    WITHDRAWAL_FEE: minorUnits.default(DEFAULT_FEE_CONFIG.withdrawalFee),
  })
  .superRefine((env, ctx) => {
    const required =
      env.PAYMENT_PROVIDER === 'paystack'
        ? (['PAYSTACK_SECRET_KEY'] as const)
        : env.PAYMENT_PROVIDER === 'bachs'
          ? (['BACHS_SECRET_KEY', 'BACHS_WEBHOOK_SECRET'] as const)
          : [];
    for (const key of required) {
      if (!env[key]?.trim())
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Required for selected payment provider',
        });
    }
    if (
      env.PAYMENT_PROVIDER === 'bachs' &&
      env.BACHS_SECRET_KEY?.startsWith('sk_live_') &&
      env.BACHS_BASE_URL !== 'https://api.bachs.io'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['BACHS_BASE_URL'],
        message: 'Live keys require the production URL',
      });
    }
    if (
      env.PAYMENT_PROVIDER === 'bachs' &&
      env.BACHS_SECRET_KEY?.startsWith('sk_sandbox_') &&
      env.BACHS_BASE_URL !== 'https://sandbox-api.bachs.io'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['BACHS_BASE_URL'],
        message: 'Sandbox keys require the sandbox URL',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Used as ConfigModule's `validate`; throws a readable error on bad config. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
