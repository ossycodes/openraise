import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { getViewer } from '../_lib/session';
import { getSite } from '../_lib/site';
import { GoogleSignIn } from './google-sign-in';
export async function Brand() {
  const site = await getSite();
  if (site.logoUrl || site.name !== 'OpenRaise') {
    return (
      <Link href="/" className="brand" aria-label={`${site.name} home`}>
        {site.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- any deployment-hosted logo URL
          <img
            src={site.logoUrl}
            alt=""
            height={34}
            style={{ height: 34, width: 'auto' }}
          />
        ) : null}
        <span>{site.name}</span>
      </Link>
    );
  }
  return (
    <Link href="/" className="brand" aria-label="OpenRaise home">
      <svg
        width="31"
        height="34"
        viewBox="0 0 31 34"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M15.5 30V13M15.5 23C4 23 1 17 3 10c7 0 12 5 12.5 13ZM15.5 17C24 17 29 11 27 4c-7 0-12 5-11.5 13Z"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M15.5 13C9 9 10 4 14 1c4 3 7 8 1.5 12Z" fill="currentColor" />
      </svg>
      <span>
        openraise<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
/**
 * The site header. Signed-out visitors also get Google One Tap when the
 * deployment has a Google client ID (pages with their own Google button turn
 * it off).
 */
export async function SiteHeader({
  preview = false,
  oneTap = process.env.NODE_ENV === 'production',
}: {
  preview?: boolean;
  oneTap?: boolean;
}) {
  const [site, viewer] = await Promise.all([getSite(), getViewer()]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {preview && (
        <div className="preview-banner">
          Design preview <span>·</span> Sample campaign. No money is collected.
        </div>
      )}
      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <Link href="/">Explore campaigns</Link>
            <a href="#giving-details">How giving works</a>
          </nav>
          {viewer ? (
            <form
              className="header-account"
              action="/api/auth/signout"
              method="post"
            >
              <span className="account-avatar" aria-hidden="true">
                {initials(viewer.name)}
              </span>
              <span className="account-name" title={viewer.email}>
                {viewer.name.split(' ')[0]}
              </span>
              <button type="submit" className="text-button">
                Sign out
              </button>
            </form>
          ) : (
            <Link className="header-account header-sign-in" href="/signin">
              Sign in
            </Link>
          )}
        </div>
      </header>
      {!viewer && oneTap && site.googleClientId && (
        <GoogleSignIn clientId={site.googleClientId} oneTap />
      )}
    </>
  );
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (
    (
      (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)![0] : '')
    ).toUpperCase() || '·'
  );
}
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <Brand />
        <p>More possibility, together.</p>
      </div>
      <p>
        Community-powered fundraising.
        <br />
        Open source. Open possibilities.
      </p>
      <a
        href="https://github.com/ossycodes/openraise"
        target="_blank"
        rel="noreferrer"
      >
        Built in the open <ArrowUpRight size={15} aria-hidden="true" />
      </a>
    </footer>
  );
}
