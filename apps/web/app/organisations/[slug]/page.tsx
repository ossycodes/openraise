import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Building2, ExternalLink, MapPin } from 'lucide-react';
import { SiteFooter, SiteHeader } from '../../_components/site-header';
import { previewEnabled, webOrigin } from '../../_lib/campaign-server';
import { jsonLd, readPublic } from '../../_lib/public-content';

interface Profile {
  slug: string;
  name: string;
  about: string;
  website: string | null;
  location: string | null;
  createdAt: string;
}

const load = (slug: string) =>
  /^[a-z0-9-]{1,80}$/.test(slug)
    ? readPublic<Profile>(`/organisations/${encodeURIComponent(slug)}`)
    : Promise.resolve(null);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const org = await load((await params).slug);
  if (!org) return { title: 'Not found', robots: { index: false } };
  return {
    title: org.name,
    description: org.about.slice(0, 160) || `${org.name} raises money for good causes.`,
    alternates: { canonical: `${webOrigin()}/organisations/${org.slug}` },
  };
}

const since = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'Africa/Lagos',
});

/** An organisation's public profile. Its campaigns join it in part 2. */
export default async function OrganisationProfile({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const org = await load((await params).slug);
  if (!org) notFound();
  return (
    <>
      <SiteHeader preview={previewEnabled()} />
      <main id="main" className="discovery-page seo-page">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLd({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: org.name,
            ...(org.website ? { url: org.website } : {}),
            ...(org.about ? { description: org.about } : {}),
          })}
        />
        <section className="seo-hero org-profile">
          <div className="org-badge" aria-hidden="true">
            <Building2 size={30} strokeWidth={1.5} />
          </div>
          <div className="section-eyebrow">Organisation</div>
          <h1>{org.name}</h1>
          <ul className="org-facts">
            {org.location && (
              <li>
                <MapPin size={15} aria-hidden="true" /> {org.location}
              </li>
            )}
            <li>On this site since {since.format(new Date(org.createdAt))}</li>
            {org.website && (
              <li>
                <a href={org.website} target="_blank" rel="noopener noreferrer nofollow">
                  {org.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}{' '}
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              </li>
            )}
          </ul>
          {org.about ? (
            org.about
              .split(/\n{2,}/)
              .map((p) => <p key={p}>{p}</p>)
          ) : (
            <p>This organisation hasn’t added a description yet.</p>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
