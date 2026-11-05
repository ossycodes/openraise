import { z } from 'zod';
const amount = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .pipe(
    z
      .string()
      .refine(
        (value) => BigInt(value) <= 9223372036854775807n,
        'Amount is too large',
      ),
  );
export const withdrawalQuoteSchema = z.object({ amount }).strict();
export const withdrawalInputSchema = z
  .object({
    amount,
    bankAccountId: z.string().min(1).max(100),
    expectedFee: z.string().regex(/^(0|[1-9]\d{0,18})$/),
  })
  .strict();
export const payoutFreezeSchema = z
  .object({ frozen: z.boolean(), reason: z.string().trim().min(3).max(500) })
  .strict();
export const withdrawalListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export type WithdrawalInput = z.infer<typeof withdrawalInputSchema>;
