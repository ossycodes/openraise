import { z } from 'zod';

export const DOCUMENT_TYPES = [
  'NIN_SLIP',
  'BVN',
  'PASSPORT',
  'DRIVERS_LICENCE',
  'VOTERS_CARD',
] as const;

const legalName = z
  .string()
  .trim()
  .min(3)
  .max(100)
  .transform((v) => v.replace(/\s+/g, ' '))
  .refine((v) => v.split(' ').length >= 2, {
    message: 'Enter your full name as it appears on your ID',
  });

export const submissionSchema = z
  .object({
    documentType: z.enum(DOCUMENT_TYPES),
    idNumber: z
      .string()
      .transform((v) => v.replace(/[\s-]/g, '').toUpperCase()),
    legalName,
    dateOfBirth: z.iso.date(),
    documentKey: z.string().max(200).optional(),
    selfieKey: z.string().max(200).optional(),
    consent: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, ctx) => {
    const elevenDigits =
      v.documentType === 'NIN_SLIP' || v.documentType === 'BVN';
    const ok = elevenDigits
      ? /^\d{11}$/.test(v.idNumber)
      : /^[A-Z0-9]{5,20}$/.test(v.idNumber);
    if (!ok)
      ctx.addIssue({
        code: 'custom',
        path: ['idNumber'],
        message: elevenDigits
          ? v.documentType === 'BVN'
            ? 'A BVN is 11 digits'
            : 'A NIN is 11 digits'
          : 'Enter the number exactly as it appears on your ID',
      });
  });
export type SubmissionInput = z.infer<typeof submissionSchema>;

export const queueSchema = z.object({
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).default('PENDING'),
  q: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export type QueueQuery = z.infer<typeof queueSchema>;

export const decisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    reason: z.string().trim().min(5).max(500).optional(),
    verifiedName: legalName.optional(),
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict()
  .refine((v) => v.decision === 'APPROVE' || !!v.reason, {
    path: ['reason'],
    message: 'Tell the creator what to fix',
  });
export type DecisionInput = z.infer<typeof decisionSchema>;
