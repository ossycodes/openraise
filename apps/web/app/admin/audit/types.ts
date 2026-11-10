export const ACTIONS: Record<string, string> = {
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
  before: Record<string, string | boolean> | null;
  after: Record<string, string | boolean> | null;
}
export interface AuditPage {
  items: AuditEvent[];
  page: number;
  hasMore: boolean;
}
