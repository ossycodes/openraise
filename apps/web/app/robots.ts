import type { MetadataRoute } from 'next';
import { previewEnabled, webOrigin } from './_lib/campaign-server';

export default function robots(): MetadataRoute.Robots {
  const origin = webOrigin().replace(/\/$/, '');
  // Preview builds show sample data; keep them out of search entirely.
  if (previewEnabled()) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Private areas and per-campaign utilities that aren't pages to rank.
      disallow: [
        '/dashboard',
        '/admin',
        '/api/',
        '/signin',
        '/campaign-updates/',
        '/campaigns/*/poster',
        '/campaigns/*/qr',
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
