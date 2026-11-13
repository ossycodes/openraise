import { z } from 'zod';
export const auditActions = [
  'USER_ACCESS_CHANGED',
  'USER_SESSIONS_REVOKED',
  'CATEGORY_CREATED',
  'CATEGORY_CHANGED',
  'SETTINGS_CHANGED',
  'WITHDRAWAL_RECONCILED',
  'WITHDRAWAL_RETRIED',
  'DONATION_VERIFICATION_REQUESTED',
  'PAYMENT_EVENT_REPROCESS_REQUESTED',
  'ADMIN_CAMPAIGN_FEATURE',
  'ADMIN_CAMPAIGN_UNFEATURE',
  'ADMIN_CAMPAIGN_PAUSE',
  'ADMIN_CAMPAIGN_RESUME',
  'ADMIN_CAMPAIGN_END',
  'ADMIN_CAMPAIGN_FREEZE_PAYOUTS',
  'ADMIN_CAMPAIGN_UNFREEZE_PAYOUTS',

  'CAMPAIGN_CHANGED',
  'REPORT_CHANGED',
  'IDENTITY_DECIDED',
  'IDENTITY_DOCUMENT_DELETED',
  'PAYOUT_NAME_REVIEW_REQUESTED',
  'PAYOUT_NAME_REVIEWED',
  'BANK_ACCOUNT_ADDED',
  'BANK_ACCOUNT_CHANGED',
  'ROLE_CHANGED',
  'ORG_MEMBER_ADDED',
  'ORG_ROLE_CHANGED',
  'ORG_MEMBER_REMOVED',
  'ORG_VERIFICATION_DECIDED',
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
