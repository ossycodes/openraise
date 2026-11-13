import type { OwnerCampaign } from '../dashboard/_lib/types';
export interface QueueItem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: string;
  owner: { name: string };
  category: { name: string; slug: string };
  location: string | null;
  goalAmount: string;
  currency: OwnerCampaign['currency'];
  coverImageUrl: string | null;
  submittedAt: string | null;
  updatedAt: string;
}
export interface ReviewQueue {
  items: QueueItem[];
  total: number;
  pending: number;
  page: number;
  limit: number;
}
export interface ReviewDetail {
  campaign: OwnerCampaign & { updatedAt: string; featured: boolean; payoutsFrozen: boolean; owner: { name: string } };
  organiser: {
    name: string;
    emailVerified: boolean;
    identityVerified: boolean;
    verifiedName: string | null;
    createdAt: string;
  };
  reviews: {
    id: string;
    decision: string;
    reason: string | null;
    createdAt: string;
    reviewer: { name: string };
  }[];
}
export const reviewDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeZone: 'Africa/Lagos',
      }).format(new Date(value))
    : 'Not submitted';
