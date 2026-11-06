import { z } from 'zod';
export const reviewQueueSchema = z.object({
  status: z
    .enum(['PENDING_REVIEW', 'ACTIVE', 'REJECTED'])
    .default('PENDING_REVIEW'),
  q: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export type ReviewQueueQuery = z.infer<typeof reviewQueueSchema>;
export const reviewDecisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    expectedUpdatedAt: z.iso.datetime(),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((v) => v.decision !== 'REJECT' || (v.reason?.length ?? 0) >= 3, {
    path: ['reason'],
    message: 'Explain the changes needed in at least 3 characters',
  });
export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;
