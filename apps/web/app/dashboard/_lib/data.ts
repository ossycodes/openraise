import 'server-only';
import { cache } from 'react';
import { apiAs } from '../../_lib/api';
import { apiOrigin } from '../../_lib/campaign-server';
import type { Category, OwnerCampaign } from './types';

/** Every campaign the signed-in person owns, any status. */
export const myCampaigns = cache((returnTo = '/dashboard') =>
  apiAs<OwnerCampaign[]>('/campaigns/mine', { returnTo }),
);

export const categories = cache(async (): Promise<Category[]> => {
  try {
    const response = await fetch(`${apiOrigin()}/categories`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? response.json() : [];
  } catch {
    return [];
  }
});
