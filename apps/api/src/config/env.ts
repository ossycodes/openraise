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
