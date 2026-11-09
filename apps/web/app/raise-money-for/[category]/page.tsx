import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ArrowUpRight, Check, Lightbulb } from 'lucide-react';
import { CampaignTile } from '../../_components/campaign-tile';
import { SiteFooter, SiteHeader } from '../../_components/site-header';
import type { Campaign } from '../../_lib/campaign';
import { categoryPage } from '../../_lib/category-pages';
import { previewEnabled, webOrigin } from '../../_lib/campaign-server';
import {
  feeSentences,
  jsonLd,
  readPublic,
  type Category,
  type FeeConfig,
} from '../../_lib/public-content';
import { getSite } from '../../_lib/site';

async function load(slug: string) {
  if (!/^[a-z0-9-]{1,50}$/.test(slug)) return null;
  const categories = await readPublic<Category[]>('/categories');
  const category = categories?.find((c) => c.slug === slug);
  if (!category) return null;
  return {
    category,
    others: categories!.filter((c) => c.slug !== slug),
    page: categoryPage(category.slug, category.name, category.description),
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const found = await load((await params).category);
  if (!found) return { title: 'Not found', robots: { index: false } };
  const { category, page } = found;
  const title = `Raise money for ${page.phrase}`;
  return {
    title,
    description: page.intro[0],
    alternates: {
      canonical: `${webOrigin()}/raise-money-for/${category.slug}`,
    },
    openGraph: { title, description: page.intro[0], type: 'website' },
  };
}

export default async function RaiseMoneyFor({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const found = await load((await params).category);
  if (!found) notFound();
  const { category, others, page } = found;
  const [listing, fees, site] = await Promise.all([
    readPublic<{ items: Campaign[]; total: number }>(
      `/campaigns?category=${encodeURIComponent(category.slug)}&limit=6`,
    ),
    readPublic<FeeConfig>('/config/fees'),
    getSite(),
  ]);
  const campaigns = listing?.items ?? [];
  const origin = webOrigin();
  const faq = [
    {
      q: 'Do donors need an account to give?',
      a: 'No. Anyone with the link can give as a guest, by card, bank transfer or the other methods the payment provider offers. They get a receipt by email.',
    },
    {
      q: 'What does it cost?',
      a: fees
        ? feeSentences(fees).join(' ')
        : 'Every fee is shown to the donor before they pay, and to you before you withdraw.',
    },
    {
      q: 'How do I receive the money?',
      a: 'Confirmed gifts collect in your campaign’s wallet. You withdraw to a Nigerian bank account in your verified name, whenever you are ready.',
    },
    {
      q: 'Who checks the campaigns?',
      a: `Every organiser’s identity is verified, and every campaign is reviewed by a ${site.name} administrator before it goes live. Anyone can report a campaign that looks wrong.`,
    },
  ];
  return (
    <>
      <SiteHeader preview={previewEnabled()} />
      <main id="main" className="discovery-page seo-page">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLd([
            {
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: site.name, item: origin },
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: `Raise money for ${page.phrase}`,
                  item: `${origin}/raise-money-for/${category.slug}`,
                },
              ],
            },
            {
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: faq.map(({ q, a }) => ({
                '@type': 'Question',
                name: q,
                acceptedAnswer: { '@type': 'Answer', text: a },
              })),
            },
          ])}
        />
        <section className="seo-hero">
          <div className="section-eyebrow">{category.name}</div>
          <h1>
            Raise money for <em>{page.phrase}.</em>
          </h1>
          {page.intro.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <div className="seo-actions">
            <Link className="primary-button" href="/dashboard/campaigns/new">
              Start a campaign <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link
              className="secondary-button"
              href={`/?category=${category.slug}#campaigns`}
            >
              Browse {category.name.toLowerCase()} campaigns
            </Link>
          </div>
        </section>

        {page.examples.length > 0 && (
          <section className="seo-band" aria-labelledby="examples-title">
            <h2 id="examples-title">What people raise for</h2>
            <ul className="seo-checks">
              {page.examples.map((e) => (
                <li key={e}>
                  <Check size={17} aria-hidden="true" /> {e}
                </li>
              ))}
            </ul>
          </section>
        )}

        {campaigns.length > 0 && (
          <section className="seo-section" aria-labelledby="live-title">
            <div className="discovery-section-heading">
              <div>
                <div className="section-eyebrow">Raising now</div>
                <h2 id="live-title">{category.name} campaigns</h2>
              </div>
              {listing && listing.total > campaigns.length && (
                <Link href={`/?category=${category.slug}#campaigns`}>
                  See all {listing.total} <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              )}
            </div>
            <div className="campaign-grid">
              {campaigns.map((c) => (
                <CampaignTile key={c.id} campaign={c} />
              ))}
            </div>
          </section>
        )}

        <section className="seo-section seo-columns">
          <div>
            <h2>Tips for a strong campaign</h2>
            <ul className="seo-tips">
              {page.tips.map((t) => (
                <li key={t}>
                  <Lightbulb size={17} aria-hidden="true" /> <span>{t}</span>
                </li>
              ))}
            </ul>
            <p className="seo-more">
              More in{' '}
              <Link href="/guides/write-a-fundraising-story">
                how to write a fundraising story
              </Link>{' '}
              and{' '}
              <Link href="/guides/promote-your-fundraiser">
                how to promote your fundraiser
              </Link>
              .
            </p>
          </div>
          <div>
            <h2>Questions people ask</h2>
            <dl className="seo-faq">
              {faq.map(({ q, a }) => (
                <div key={q}>
                  <dt>{q}</dt>
                  <dd>{a}</dd>
                </div>
              ))}
            </dl>
            <p className="seo-more">
              Step by step:{' '}
              <Link href="/guides/how-crowdfunding-works">
                how fundraising works here
              </Link>
              .
            </p>
          </div>
        </section>

        <nav className="seo-section seo-others" aria-label="Other causes">
          <h2>Other causes</h2>
          <ul>
            {others.map((c) => (
              <li key={c.slug}>
                <Link href={`/raise-money-for/${c.slug}`}>{c.name}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
      <SiteFooter />
    </>
  );
}
