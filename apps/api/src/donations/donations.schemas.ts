import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from '@openraise/shared';

export const donationInputSchema = z
  .object({
    amount: z.string().regex(/^[1-9]\d{0,18}$/),
    currency: z.enum(SUPPORTED_CURRENCIES).optional(),
    donorCoversPlatformFee: z.boolean().default(false),
    updatesOptIn: z.boolean().default(false),
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase())
      .optional(),
  })
  .strict();
export type DonationInput = z.infer<typeof donationInputSchema>;
export const idempotencyKeySchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  .transform((value) => value.toLowerCase());
