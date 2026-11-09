import type { IdentityVerification } from '../../dashboard/_lib/types';

export type AdminVerification = IdentityVerification & {
  provider: string;
  updatedAt: string;
};

export interface VerificationQueue {
  items: (AdminVerification & { user: { name: string; email: string } })[];
  total: number;
  pending: number;
  page: number;
  limit: number;
}

export interface VerificationDetail {
  verification: AdminVerification & {
    reviewer: { name: string } | null;
    hasDocument: boolean;
    /** Set when the retention policy deleted a verified person's photo */
    documentDeletedAt: string | null;
  };
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: string;
  };
  history: (AdminVerification & { reviewer: { name: string } | null })[];
}

export const STATUS_TEXT: Record<AdminVerification['status'], string> = {
  PENDING: 'Waiting for review',
  VERIFIED: 'Verified',
  REJECTED: 'Not verified',
};
