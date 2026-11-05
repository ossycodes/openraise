import 'server-only';
import { cache } from 'react';
import {
  suggestedAmounts,
  type Campaign,
  type DonationQuote,
  type Supporter,
} from './campaign';
export const apiOrigin = () =>
  (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
export const webOrigin = () => process.env.WEB_URL ?? 'http://localhost:3000';
export const previewEnabled = () =>
  process.env.CAMPAIGN_PREVIEW === 'true' &&
  process.env.NODE_ENV !== 'production';
export class CampaignLoadError extends Error {
  constructor(public status: number) {
    super('Campaign unavailable');
  }
}
export const getCampaign = cache(async (slug: string): Promise<Campaign> => {
  const response = await fetch(
    `${apiOrigin()}/campaigns/${encodeURIComponent(slug)}`,
    { cache: 'no-store', signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) throw new CampaignLoadError(response.status);
  return response.json();
});
export async function getSupporters(slug: string): Promise<Supporter[] | null> {
  try {
    const response = await fetch(
      `${apiOrigin()}/campaigns/${encodeURIComponent(slug)}/donations`,
      { cache: 'no-store', signal: AbortSignal.timeout(5000) },
    );
    return response.ok ? (await response.json()).items : null;
  } catch {
    return null;
  }
}

export async function initialQuote(
  campaign: Campaign,
): Promise<DonationQuote | null> {
  if (
    campaign.status !== 'ACTIVE' ||
    (campaign.endsAt && new Date(campaign.endsAt).getTime() <= Date.now())
  )
    return null;
  try {
    const response = await fetch(
      `${apiOrigin()}/campaigns/${encodeURIComponent(campaign.slug)}/donations/quote`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: suggestedAmounts[campaign.currency][1]!.toString(),
          currency: campaign.currency,
          donorCoversPlatformFee: false,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      },
    );
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}
