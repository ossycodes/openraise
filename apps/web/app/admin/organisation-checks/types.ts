import type { OrgVerification } from '../../dashboard/organisations/types';

export type AdminOrgCheck = OrgVerification & { updatedAt: string };

export interface OrgCheckQueue {
  items: (AdminOrgCheck & { organisation: { name: string; slug: string } })[];
  total: number;
  pending: number;
  page: number;
  limit: number;
}

export interface OrgCheckDetail {
  verification: AdminOrgCheck & {
    reviewer: { name: string } | null;
    hasDocument: boolean;
  };
  organisation: {
    id: string;
    name: string;
    slug: string;
    website: string | null;
    location: string | null;
    createdAt: string;
    members: number;
  };
  submittedBy: { name: string; email: string };
  history: (AdminOrgCheck & { reviewer: { name: string } | null })[];
}

export const CHECK_STATUS_TEXT: Record<OrgVerification['status'], string> = {
  PENDING: 'Waiting for review',
  VERIFIED: 'Verified',
  REJECTED: 'Not verified',
};
