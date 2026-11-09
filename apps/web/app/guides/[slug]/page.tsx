import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, ReceiptText } from 'lucide-react';
import { SiteFooter, SiteHeader } from '../../_components/site-header';
import { previewEnabled, webOrigin } from '../../_lib/campaign-server';
import { GUIDES, guide } from '../../_lib/guides';
import {
  feeSentences,
  jsonLd,
  readPublic,
  type FeeConfig,
} from '../../_lib/public-content';
import { getSite } from '../../_lib/site';

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const g = guide((await params).slug);
  if (!g) return { title: 'Not found', robots: { index: false } };
  return {
    title: g.title,
    description: g.description,
    alternates: { canonical: `${webOrigin()}/guides/${g.slug}` },
    openGraph: { title: g.title, description: g.description, type: 'article' },
  };
}

const updated = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const g = guide((await params).slug);
  if (!g) notFound();
  const [site, fees] = await Promise.all([
    getSite(),
    g.showFees ? readPublic<FeeConfig>('/config/fees') : null,
  ]);
  const others = GUIDES.filter((o) => o.slug !== g.slug);
  const url = `${webOrigin()}/guides/${g.slug}`;
  return (
    <>
      <SiteHeader preview={previewEnabled()} />
      <main id="main" className="discovery-page seo-page">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLd({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: g.title,
            description: g.description,
            dateModified: g.updated,
            mainEntityOfPage: url,
            publisher: { '@type': 'Organization', name: site.name },
          })}
        />
        <article className="guide-article">
          <Link className="review-back" href="/guides">
            <ArrowLeft size={16} aria-hidden="true" /> All guides
          </Link>
          <div className="section-eyebrow">Guide · {g.minutes} min read</div>
          <h1>{g.title}</h1>
          <p className="guide-lede">{g.description}</p>
          {g.sections.map((s, i) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              {s.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
              {s.bullets && (
                <ul>
                  {s.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              {g.showFees && i === 0 && fees && (
                <aside className="guide-fees" aria-label="Fees on this site">
                  <ReceiptText size={20} aria-hidden="true" />
                  <div>
                    <strong>What it costs on {site.name}</strong>
                    <ul>
                      {feeSentences(fees).map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                </aside>
              )}
            </section>
          ))}
          <p className="guide-updated">
            Last updated {updated.format(new Date(`${g.updated}T00:00:00Z`))}
          </p>
          <div className="guide-next">
            <Link className="primary-button" href="/dashboard/campaigns/new">
              Start a campaign <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <nav className="guide-more" aria-label="More guides">
            <h2>Keep reading</h2>
            <ul>
              {others.map((o) => (
                <li key={o.slug}>
                  <Link href={`/guides/${o.slug}`}>{o.title}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
