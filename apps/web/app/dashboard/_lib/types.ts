import type { Currency } from '@openraise/shared';

export type CampaignStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'ACTIVE'
  | 'PAUSED'
  | 'ENDED'
  | 'REJECTED';

/** A campaign as its owner sees it (GET /campaigns/mine). */
export interface OwnerCampaign {
  id: string;
  slug: string;
  title: string;
  summary: string;
  story: string;
  videoUrl: string | null;
  category: { slug: string; name: string };
  goalAmount: string;
  raisedAmount: string;
  donorCount: number;
  currency: Currency;
  beneficiaryName: string | null;
  location: string | null;
  endsAt: string | null;
  images: { id: string; url: string; position: number }[];
  coverImageUrl: string | null;
  status: CampaignStatus;
  rejectionReason?: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface Category {
  slug: string;
  name: string;
}

/** What the API needs before a campaign can go to review (SUBMIT_REQUIREMENTS). */
export const SUMMARY_MIN = 10;
export const STORY_MIN = 100;
export const MAX_IMAGES = 10;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'In review',
  ACTIVE: 'Live',
  PAUSED: 'Paused',
  ENDED: 'Ended',
  REJECTED: 'Needs changes',
};

/** Same rules as the API's EDITABLE_STATUSES and CURRENCY_EDITABLE_STATUSES */
export const canEdit = (s: CampaignStatus) =>
  s === 'DRAFT' || s === 'REJECTED' || s === 'ACTIVE' || s === 'PAUSED';
export const canChangeCurrency = (s: CampaignStatus) =>
  s === 'DRAFT' || s === 'REJECTED';
