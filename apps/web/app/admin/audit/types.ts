export const ACTIONS: Record<string, string> = {
  USER_ACCESS_CHANGED: 'User access changed',
  USER_SESSIONS_REVOKED: 'User sessions ended',
  CATEGORY_CREATED: 'Category created',
  CATEGORY_CHANGED: 'Category changed',
  SETTINGS_CHANGED: 'Branding and fees changed',
  WITHDRAWAL_RECONCILED: 'Payout reconciled',
  WITHDRAWAL_RETRIED: 'Returned payout retried',
  DONATION_VERIFICATION_REQUESTED: 'Payment verification requested',
  PAYMENT_EVENT_REPROCESS_REQUESTED: 'Provider event reprocessing requested',
  ADMIN_CAMPAIGN_FEATURE: 'Campaign featured',
  ADMIN_CAMPAIGN_UNFEATURE: 'Campaign removed from featured',
  ADMIN_CAMPAIGN_PAUSE: 'Campaign paused by administrator',
  ADMIN_CAMPAIGN_RESUME: 'Campaign resumed by administrator',
  ADMIN_CAMPAIGN_END: 'Campaign ended by administrator',
  ADMIN_CAMPAIGN_FREEZE_PAYOUTS: 'Campaign payouts frozen',
  ADMIN_CAMPAIGN_UNFREEZE_PAYOUTS: 'Campaign payout freeze lifted',

  CAMPAIGN_CHANGED: 'Campaign controls changed',
  REPORT_CHANGED: 'Report outcome changed',
  IDENTITY_DECIDED: 'Identity decision recorded',
  IDENTITY_DOCUMENT_DELETED: 'ID photo deleted',
  PAYOUT_NAME_REVIEW_REQUESTED: 'Payout name review requested',
  PAYOUT_NAME_REVIEWED: 'Payout name review decided',
  BANK_ACCOUNT_ADDED: 'Payout account added',
  BANK_ACCOUNT_CHANGED: 'Payout account changed',
  ROLE_CHANGED: 'Account role changed',
  ORG_MEMBER_ADDED: 'Organisation member added',
  ORG_ROLE_CHANGED: 'Organisation role changed',
  ORG_MEMBER_REMOVED: 'Organisation member removed',
  ORG_VERIFICATION_DECIDED: 'Organisation check decided',
};
/** Automatic jobs that act without a person, by their recorded actor id. */
export const SYSTEM_ACTORS: Record<string, string> = {
  'system:id-photo-retention': 'Automatic: ID photo retention',
};
export interface AuditEvent {
  id: string;
  createdAt: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  subjectId: string | null;
  before: Record<string, string | number | boolean | null> | null;
  after: Record<string, string | number | boolean | null> | null;
}
export interface AuditPage {
  items: AuditEvent[];
  page: number;
  hasMore: boolean;
}
