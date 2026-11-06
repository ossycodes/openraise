import type { OwnerCampaign } from '../../dashboard/_lib/types';
export const REPORT_CATEGORY: Record<string, string> = {
  FRAUD: 'Suspected fraud',
  MISLEADING: 'Misleading information',
  OFFENSIVE: 'Offensive content',
  OTHER: 'Other concern',
};
export const ACTION_LABEL: Record<string, string> = {
  PAUSE: 'Pause donations',
  LIFT_PAUSE: 'Lift admin pause',
  FREEZE: 'Freeze payouts',
  UNFREEZE: 'Unfreeze payouts',
  RESOLVE: 'Resolve report',
  DISMISS: 'Dismiss report',
};
export interface ReportItem {
  id: string;
  category: string;
  details: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  campaignId: string;
  campaign: {
    title: string;
    slug: string;
    status: string;
    owner: { name: string };
  };
}
export interface ReportQueue {
  items: ReportItem[];
  page: number;
  limit: number;
  total: number;
  open: number;
}
export interface ReportDetail {
  report: Omit<ReportItem, 'campaign'>;
  campaign: OwnerCampaign & { owner: { name: string } };
  controls: {
    updatedAt: string;
    payoutsFrozen: boolean;
    payoutFreezeReason: string | null;
    moderationPaused: boolean;
    moderationPauseReason: string | null;
  };
  actions: {
    id: string;
    action: string;
    reason: string;
    createdAt: string;
    actor: { name: string };
  }[];
}
