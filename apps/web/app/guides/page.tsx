import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, BookOpen } from 'lucide-react';
import { SiteFooter, SiteHeader } from '../_components/site-header';
import { previewEnabled, webOrigin } from '../_lib/campaign-server';
import { GUIDES } from '../_lib/guides';

export const metadata: Metadata = {
  title: 'Fundraising guides',
  description:
    'Practical guides for raising money: how it works, writing your story and getting it shared.',
  alternates: { canonical: `${webOrigin()}/guides` },
};

export default function GuidesPage() {
  return (
    <>
      <SiteHeader preview={previewEnabled()} />
      <main id="main" className="discovery-page seo-page">
        <section className="seo-hero">
          <div className="section-eyebrow">Guides</div>
          <h1>
            Raise money <em>with confidence.</em>
          </h1>
          <p>
            Short, practical guides for anyone starting a campaign: how it all
            works, how to tell your story, and how to get it in front of the
            people who will help.
          </p>
        </section>
        <ul className="guide-list">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link href={`/guides/${g.slug}`} className="guide-card">
                <BookOpen size={22} strokeWidth={1.6} aria-hidden="true" />
                <h2>{g.title}</h2>
                <p>{g.description}</p>
                <span>
                  {g.minutes} min read{' '}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
