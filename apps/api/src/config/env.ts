import { DEFAULT_FEE_CONFIG, SUPPORTED_CURRENCIES } from '@openraise/shared';
import { z } from 'zod';

const bps = z.coerce.number().int().min(0).max(10_000);
const minorUnits = z.coerce.bigint().nonnegative();

/**
 * Every environment variable the API reads, validated once at boot.
 * Keep in sync with .env.example.
 */
export const envSchema = z.object({
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

  // Fees (see docs/Features/Fee engine.md). Amounts are minor units.
  DEFAULT_CURRENCY: z.enum(SUPPORTED_CURRENCIES).default('NGN'),
  PLATFORM_FEE_BPS: bps.default(DEFAULT_FEE_CONFIG.platformFeeBps),
  DONOR_FEE_BPS: bps.default(DEFAULT_FEE_CONFIG.donorFeeBps),
  DONOR_FLAT_FEE: minorUnits.default(DEFAULT_FEE_CONFIG.donorFlatFee),
  DONOR_FLAT_FEE_THRESHOLD: minorUnits.default(
    DEFAULT_FEE_CONFIG.donorFlatFeeThreshold,
  ),
  WITHDRAWAL_FEE: minorUnits.default(DEFAULT_FEE_CONFIG.withdrawalFee),
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
