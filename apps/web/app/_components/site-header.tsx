import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { getSite } from '../_lib/site';
export async function Brand() {
  const site = await getSite();
  if (site.logoUrl || site.name !== 'OpenRaise') {
    return (
      <Link href="/" className="brand" aria-label={`${site.name} home`}>
        {site.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- any deployment-hosted logo URL
          <img src={site.logoUrl} alt="" height={34} style={{ height: 34, width: 'auto' }} />
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
export function SiteHeader({ preview = false }: { preview?: boolean }) {
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
          <Link className="header-link" href="/#about">
            Made for community <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>
    </>
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
