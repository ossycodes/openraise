import { z } from 'zod';
export const reportInputSchema = z
  .object({
    category: z.enum(['FRAUD', 'MISLEADING', 'OFFENSIVE', 'OTHER']),
    details: z.string().trim().min(20).max(2000),
  })
  .strict();
export type ReportInput = z.infer<typeof reportInputSchema>;
export const reportsQuerySchema = z.object({
  status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']).default('OPEN'),
  q: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export type ReportsQuery = z.infer<typeof reportsQuerySchema>;
export const moderationInputSchema = z
  .object({
    action: z.enum([
      'PAUSE',
      'LIFT_PAUSE',
      'FREEZE',
      'UNFREEZE',
      'RESOLVE',
      'DISMISS',
    ]),
    reason: z.string().trim().min(5).max(500),
    expectedReportUpdatedAt: z.iso.datetime(),
    expectedCampaignUpdatedAt: z.iso.datetime(),
  })
  .strict();
export type ModerationInput = z.infer<typeof moderationInputSchema>;
