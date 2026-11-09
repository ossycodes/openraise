import type { MetadataRoute } from 'next';
import type { Campaign } from './_lib/campaign';
import { webOrigin } from './_lib/campaign-server';
import { GUIDES } from './_lib/guides';
import { readPublic, type Category } from './_lib/public-content';

// Built per request: the API isn't reachable at build time, and campaigns
// change all day.
export const dynamic = 'force-dynamic';

/** Live campaigns, 50 per API page, capped so the sitemap stays quick. */
const MAX_CAMPAIGN_PAGES = 20;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = webOrigin().replace(/\/$/, '');
  const entries: MetadataRoute.Sitemap = [
    { url: `${origin}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${origin}/guides`, changeFrequency: 'monthly', priority: 0.6 },
    ...GUIDES.map((g) => ({
      url: `${origin}/guides/${g.slug}`,
      lastModified: new Date(`${g.updated}T00:00:00Z`),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
  const categories = await readPublic<Category[]>('/categories');
  for (const c of categories ?? [])
    entries.push({
      url: `${origin}/raise-money-for/${c.slug}`,
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  for (let page = 1; page <= MAX_CAMPAIGN_PAGES; page++) {
    const listing = await readPublic<{
      items: (Campaign & { updatedAt: string })[];
      total: number;
    }>(`/campaigns?limit=50&page=${page}&sort=newest`);
    for (const c of listing?.items ?? [])
      entries.push({
        url: `${origin}/campaigns/${c.slug}`,
        lastModified: new Date(c.updatedAt),
        changeFrequency: 'daily',
        priority: 0.8,
      });
    if (!listing || page * 50 >= listing.total) break;
  }
  return entries;
}
