import { z } from 'zod';
export const adminListSchema = z.object({
  q: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export const reason = z.string().trim().min(5).max(500);
export const userActionSchema = z
  .object({
    action: z.enum(['SET_ROLE', 'REVOKE_SESSIONS']),
    role: z.enum(['ADMIN', 'USER']).optional(),
    expectedUpdatedAt: z.iso.datetime(),
    reason,
  })
  .strict()
  .refine((v) => v.action !== 'SET_ROLE' || v.role !== undefined, {
    path: ['role'],
    message: 'Choose a role',
  });
export const campaignActionSchema = z
  .object({
    action: z.enum([
      'FEATURE',
      'UNFEATURE',
      'PAUSE',
      'RESUME',
      'END',
      'FREEZE_PAYOUTS',
      'UNFREEZE_PAYOUTS',
    ]),
    expectedUpdatedAt: z.iso.datetime(),
    reason,
  })
  .strict();
export const moneyActionSchema = z
  .object({
    action: z.enum(['VERIFY', 'RETRY', 'REPROCESS']),
    expectedUpdatedAt: z.iso.datetime(),
    reason,
  })
  .strict();
export type AdminList = z.infer<typeof adminListSchema>;
export type UserAction = z.infer<typeof userActionSchema>;
export type CampaignAction = z.infer<typeof campaignActionSchema>;
export type MoneyAction = z.infer<typeof moneyActionSchema>;
