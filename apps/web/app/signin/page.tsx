import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { HandHeart, ShieldCheck } from 'lucide-react';
import { GoogleSignIn } from '../_components/google-sign-in';
import { SiteFooter, SiteHeader } from '../_components/site-header';
import { getViewer, safeNext } from '../_lib/session';
import { getSite } from '../_lib/site';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  const [site, viewer] = await Promise.all([getSite(), getViewer()]);
  if (viewer) redirect(next);
  return (
    <>
      <SiteHeader oneTap={false} />
      <main id="main" className="signin-page">
        <div className="signin-card">
          <HandHeart size={38} strokeWidth={1.3} aria-hidden="true" />
          <div className="section-eyebrow">Welcome</div>
          <h1>Sign in to {site.name}</h1>
          <p>
            Start a campaign, follow the causes you care about and keep your
            giving in one place.
          </p>
          {site.googleClientId ? (
            <GoogleSignIn clientId={site.googleClientId} button next={next} />
          ) : (
            <p className="privacy-note">
              Sign-in isn’t set up on this site yet. You can still give to any
              campaign without an account.
            </p>
          )}
          <p className="signin-note">
            <ShieldCheck size={15} aria-hidden="true" /> We only receive your
            name and email address from Google.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
