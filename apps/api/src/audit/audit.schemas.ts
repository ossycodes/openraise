import { z } from 'zod';
export const auditActions = [
  'CAMPAIGN_CHANGED',
  'REPORT_CHANGED',
  'IDENTITY_DECIDED',
  'BANK_ACCOUNT_ADDED',
  'BANK_ACCOUNT_CHANGED',
  'ROLE_CHANGED',
] as const;
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    'Use a valid calendar date',
  );
export const auditQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    action: z.union([z.enum(auditActions), z.literal('')]).optional(),
    q: z.string().trim().max(100).default(''),
    from: z.union([day, z.literal('')]).optional(),
    to: z.union([day, z.literal('')]).optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'End date must follow start date',
    path: ['to'],
  });
export type AuditQuery = z.infer<typeof auditQuerySchema>;
