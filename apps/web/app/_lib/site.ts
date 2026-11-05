import 'server-only';
import { cache } from 'react';
import { apiOrigin } from './campaign-server';

/** The deployment's branding, from the API's GET /config/site. */
export interface Site {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  supportEmail: string | null;
  /** Set when the deployment enables "Sign in with Google" */
  googleClientId: string | null;
}

export const DEFAULT_SITE: Site = {
  name: 'OpenRaise',
  logoUrl: null,
  primaryColor: null,
  supportEmail: null,
  googleClientId: null,
};

/** One fetch per request; falls back to OpenRaise if the API is unreachable. */
export const getSite = cache(async (): Promise<Site> => {
  try {
    const response = await fetch(`${apiOrigin()}/config/site`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return DEFAULT_SITE;
    const site = (await response.json()) as Partial<Site>;
    return {
      ...DEFAULT_SITE,
      ...site,
      name: site.name?.trim() || DEFAULT_SITE.name,
      primaryColor: /^#[0-9a-fA-F]{6}$/.test(site.primaryColor ?? '') ? site.primaryColor! : null,
      googleClientId: site.googleClientId?.trim() || null,
    };
  } catch {
    return DEFAULT_SITE;
  }
});
