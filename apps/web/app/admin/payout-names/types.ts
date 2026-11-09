import type { NameReview } from '../../dashboard/_lib/types';

export type AdminNameReview = NameReview & {
  accountName: string;
  verifiedName: string;
  updatedAt: string;
};

export interface NameReviewQueue {
  items: (AdminNameReview & {
    user: { name: string; email: string };
    account: string;
  })[];
  total: number;
  pending: number;
  page: number;
  limit: number;
}

export interface NameReviewDetail {
  review: AdminNameReview & { reviewer: { name: string } | null };
  user: { id: string; name: string; email: string; createdAt: string };
  account: {
    id: string;
    bankName: string;
    maskedAccountNumber: string;
    accountName: string;
    createdAt: string;
    removed: boolean;
    withdrawals: number;
  };
  currentVerifiedName: string | null;
  history: (AdminNameReview & { reviewer: { name: string } | null })[];
}

export const REVIEW_STATUS_TEXT: Record<NameReview['status'], string> = {
  PENDING: 'Waiting for review',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  CANCELLED: 'Withdrawn: account removed',
};
