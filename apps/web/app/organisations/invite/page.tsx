import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { SiteFooter, SiteHeader } from '../../_components/site-header';
import { apiOrigin, previewEnabled } from '../../_lib/campaign-server';
import { getViewer } from '../../_lib/session';
import { acceptInvite } from '../../dashboard/organisation-actions';
import {
  ROLE_HINT,
  ROLE_LABEL,
  type OrganisationRole,
} from '../../dashboard/organisations/types';

export const metadata: Metadata = {
  title: 'Organisation invitation',
  robots: { index: false, follow: false },
};

interface Preview {
  organisation: { name: string; slug: string };
  role: OrganisationRole;
  email: string;
  status: 'OPEN' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
}

async function preview(token: string): Promise<Preview | null> {
  if (token.length < 20 || token.length > 200) return null;
  try {
    const res = await fetch(`${apiOrigin()}/organisation-invites/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? ((await res.json()) as Preview) : null;
  } catch {
    return null;
  }
}

const CLOSED: Record<Exclude<Preview['status'], 'OPEN'>, string> = {
  ACCEPTED: 'This invitation has already been used.',
  REVOKED: 'This invitation was withdrawn or replaced by a newer one.',
  EXPIRED: 'This invitation has expired.',
};

/** Where an emailed invitation link lands: see what it's for, then accept. */
export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token = '', error } = await searchParams;
  const [invite, viewer] = await Promise.all([preview(token), getViewer()]);
  const here = `/organisations/invite?${new URLSearchParams({ token })}`;
  const wrongAccount =
    invite && viewer && viewer.email.toLowerCase() !== invite.email;
  return (
    <>
      <SiteHeader preview={previewEnabled()} />
      <main id="main" className="discovery-page seo-page">
        <section className="invite-card">
          <Building2 size={30} strokeWidth={1.5} aria-hidden="true" />
          {!invite ? (
            <>
              <h1>We couldn’t find that invitation.</h1>
              <p>
                Check you opened the whole link from the email, or ask for a new
                invitation.
              </p>
            </>
          ) : (
            <>
              <div className="section-eyebrow">Invitation</div>
              <h1>
                Join <em>{invite.organisation.name}</em>
              </h1>
              <p>
                You’ve been invited as{' '}
                <strong>{ROLE_LABEL[invite.role].toLowerCase()}</strong>:{' '}
                {ROLE_HINT[invite.role].toLowerCase()}
              </p>
              {error && (
                <p className="dashboard-notice error" role="alert">
                  {error}
                </p>
              )}
              {invite.status !== 'OPEN' ? (
                <p className="dashboard-notice error" role="alert">
                  {CLOSED[invite.status]} Ask the organisation for a new one.
                </p>
              ) : !viewer ? (
                <>
                  <p>
                    Sign in with <strong>{invite.email}</strong> to accept. New
                    here? Create an account with that address first.
                  </p>
                  <Link
                    className="primary-button"
                    href={`/signin?next=${encodeURIComponent(here)}`}
                  >
                    Sign in to accept
                  </Link>
                </>
              ) : wrongAccount ? (
                <p className="dashboard-notice error" role="alert">
                  This invitation is for {invite.email}, but you’re signed in as{' '}
                  {viewer.email}. Sign out and sign in with {invite.email}.
                </p>
              ) : (
                <form action={acceptInvite}>
                  <input type="hidden" name="token" value={token} />
                  <button type="submit" className="primary-button">
                    Accept and join
                  </button>
                </form>
              )}
              <p className="field-hint">
                <Link href={`/organisations/${invite.organisation.slug}`}>
                  See {invite.organisation.name}’s public profile
                </Link>
              </p>
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
