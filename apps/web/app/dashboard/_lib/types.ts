import type { Currency } from '@openraise/shared';

export type CampaignStatus =
  'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'REJECTED';

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
  moderationPaused?: boolean;
  moderationPauseReason?: string | null;
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

/** GET /campaigns/:id/money. Amounts are minor units as strings. */
export interface MoneySummary {
  currency: Currency;
  donationCount: number;
  raised: string;
  platformFees: string;
  received: string;
  available: string;
  withdrawalsInProgress: string;
  paidOut: string;
  withdrawalFeesPaid: string;
  withdrawalFee: string;
  payoutsSupported: boolean;
  payoutsFrozen: boolean;
  payoutFreezeReason: string | null;
}

export interface ReceivedDonation {
  donorName: string | null;
  donorMessage: string | null;
  isAnonymous: boolean;
  id: string;
  currency: Currency;
  amount: string;
  platformFee: string;
  donorFee: string;
  netToCampaign: string;
  donorCoveredPlatformFee: boolean;
  confirmedAt: string;
}

export type WithdrawalStatus =
  | 'INITIALIZING'
  | 'PENDING'
  | 'UNCERTAIN'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REVERSED';

export interface Withdrawal {
  id: string;
  bankName: string;
  accountName: string;
  maskedAccountNumber: string;
  currency: Currency;
  amount: string;
  fee: string;
  netPaidOut: string;
  status: WithdrawalStatus;
  reconciliationRequired: boolean;
  createdAt: string;
}

export const WITHDRAWAL_LABEL: Record<WithdrawalStatus, string> = {
  INITIALIZING: 'Starting',
  PENDING: 'On its way',
  UNCERTAIN: 'Being checked',
  SUCCEEDED: 'Paid',
  FAILED: 'Failed, money returned',
  REVERSED: 'Reversed, money returned',
};

/** A payout bank account (GET /bank-accounts). */
export interface BankAccount {
  id: string;
  bankCode: string;
  bankName: string;
  accountName: string;
  maskedAccountNumber: string;
  isDefault: boolean;
  recipientUsable: boolean;
  nameMatchesProfile: boolean;
  /** MATCHES and APPROVED can be paid; MISMATCH needs a review */
  nameCheck: 'MATCHES' | 'APPROVED' | 'MISMATCH' | 'UNVERIFIED';
  nameReview: NameReview | null;
  payoutsAvailableAt: string;
  createdAt: string;
}

/** A request to withdraw to an account whose name differs from the verified one. */
export interface NameReview {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'CANCELLED';
  explanation: string;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface Bank {
  code: string;
  name: string;
}

export type IdentityStatus = 'NONE' | 'PENDING' | 'VERIFIED' | 'REJECTED';
export type DocumentType =
  | 'NIN_SLIP'
  | 'PASSPORT'
  | 'DRIVERS_LICENCE'
  | 'VOTERS_CARD';

export const DOCUMENT_LABEL: Record<DocumentType, string> = {
  NIN_SLIP: 'NIN slip or card',
  PASSPORT: 'International passport',
  DRIVERS_LICENCE: 'Driver’s licence',
  VOTERS_CARD: 'Voter’s card',
};

export interface IdentityVerification {
  id: string;
  status: Exclude<IdentityStatus, 'NONE'>;
  documentType: DocumentType;
  idNumberLast4: string;
  legalName: string;
  dateOfBirth: string;
  verifiedName: string | null;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** GET /kyc */
export interface IdentityState {
  status: IdentityStatus;
  provider: string;
  documentRequired: boolean;
  verification: IdentityVerification | null;
}

/** Same rules as the API's EDITABLE_STATUSES and CURRENCY_EDITABLE_STATUSES */
export const canEdit = (s: CampaignStatus) =>
  s === 'DRAFT' || s === 'REJECTED' || s === 'ACTIVE' || s === 'PAUSED';
export const canChangeCurrency = (s: CampaignStatus) =>
  s === 'DRAFT' || s === 'REJECTED';
