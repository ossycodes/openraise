export const ACTIONS: Record<string, string> = {
  CAMPAIGN_CHANGED: 'Campaign controls changed',
  REPORT_CHANGED: 'Report outcome changed',
  IDENTITY_DECIDED: 'Identity decision recorded',
  BANK_ACCOUNT_ADDED: 'Payout account added',
  BANK_ACCOUNT_CHANGED: 'Payout account changed',
  ROLE_CHANGED: 'Account role changed',
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
