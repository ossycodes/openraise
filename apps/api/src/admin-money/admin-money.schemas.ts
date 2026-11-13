import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from '@openraise/shared';
export const moneyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  q: z.string().trim().max(100).default(''),
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
  campaignId: z.string().min(1).max(100).optional(),
  kind: z
    .enum([
      'DONATION',
      'WITHDRAWAL_HOLD',
      'WITHDRAWAL_SETTLE',
      'WITHDRAWAL_REVERSE',
      'REFUND',
      'ADJUSTMENT',
    ])
    .optional(),
});
export type MoneyQuery = z.infer<typeof moneyQuerySchema>;
export const reconciliationQuerySchema = moneyQuerySchema
  .omit({ kind: true })
  .extend({
    kind: z.enum(['WITHDRAWAL', 'DONATION', 'EVENT']).default('WITHDRAWAL'),
    scope: z.enum(['review', 'returned']).default('review'),
  })
  .refine((v) => v.scope !== 'returned' || v.kind === 'WITHDRAWAL', {
    path: ['scope'],
    message: 'Returned records are withdrawals only',
  })
  .refine((v) => v.kind !== 'EVENT' || !v.campaignId, {
    path: ['campaignId'],
    message: 'Event queues use reference search, not campaign filters',
  });
export type ReconciliationQuery = z.infer<typeof reconciliationQuerySchema>;
export const reconciliationKindSchema = z.enum([
  'WITHDRAWAL',
  'DONATION',
  'EVENT',
]);
