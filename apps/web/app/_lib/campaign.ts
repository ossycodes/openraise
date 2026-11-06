import type { Currency } from '@openraise/shared';
export interface Campaign {
  id: string;
  slug: string;
  title: string;
  summary: string;
  story: string;
  videoUrl: string | null;
  category: { slug: string; name: string };
  owner: { name: string };
  goalAmount: string;
  raisedAmount: string;
  donorCount: number;
  currency: Currency;
  beneficiaryName: string | null;
  location: string | null;
  endsAt: string | null;
  images: { id: string; url: string; position: number }[];
  coverImageUrl: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'ENDED';
  publishedAt: string | null;
  createdAt: string;
}
export interface DonationQuote {
  amount: string;
  currency: Currency;
  platformFee: string;
  donorFee: string;
  totalCharged: string;
  netToCampaign: string;
  donorCoversPlatformFee: boolean;
  provider: string;
  minimumAmount?: string;
}
export interface DonationSession extends DonationQuote {
  id: string;
  campaignSlug?: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  checkoutState: 'INITIALIZING' | 'READY' | 'FAILED' | 'UNCERTAIN';
  checkoutUrl: string | null;
}
export interface Supporter {
  displayName?: string;
  message?: string | null;
  id: string;
  amount: string;
  currency: Currency;
  confirmedAt: string;
}
export const suggestedAmounts: Record<Currency, bigint[]> = {
  NGN: [250000n, 500000n, 1000000n, 2500000n],
  USD: [1000n, 2500n, 5000n, 10000n],
  GHS: [1000n, 5000n, 10000n, 20000n],
  KES: [10000n, 50000n, 100000n, 250000n],
};
export const decimalInput = (minor: string | bigint) => {
  const value = BigInt(minor);
  return `${value / 100n}${value % 100n ? `.${(value % 100n).toString().padStart(2, '0')}` : ''}`;
};
export const progressPercent = (raised: string, goal: string) =>
  BigInt(goal) > 0n
    ? Number((BigInt(raised) * 10000n) / BigInt(goal)) / 100
    : 0;
