import { z } from 'zod';
const minor = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,18})$/)
  .refine((v) => BigInt(v) <= 9223372036854775807n, 'Amount is too large');
const webUrl = z
  .url()
  .refine(
    (v) => ['https:', 'http:'].includes(new URL(v).protocol),
    'Use an HTTP or HTTPS URL',
  );
export const settingsValuesSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    logoUrl: webUrl.nullable(),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable(),
    supportEmail: z.email().nullable(),
    platformFeeBps: z.number().int().min(0).max(10000),
    donorFeeBps: z.number().int().min(0).max(10000),
    donorFlatFee: minor,
    donorFlatFeeThreshold: minor,
    withdrawalFee: minor,
  })
  .strict();
export const saveSettingsSchema = z
  .object({
    values: settingsValuesSchema,
    expectedVersion: z.number().int().min(0),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export type SettingsValues = z.infer<typeof settingsValuesSchema>;
export type SaveSettings = z.infer<typeof saveSettingsSchema>;
