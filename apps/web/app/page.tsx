import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { formatMoney } from '@openraise/shared';
import { SiteFooter, SiteHeader } from './_components/site-header';
import { apiOrigin, previewEnabled } from './_lib/campaign-server';
import type { Campaign } from './_lib/campaign';
export default async function HomePage() {
  let campaigns: Campaign[] | null = null;
  try {
    const response = await fetch(`${apiOrigin()}/campaigns?limit=12`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) campaigns = (await response.json()).items;
  } catch {
    /* visible partial state */
  }
  return (
    <>
      <SiteHeader preview={previewEnabled()} />
      <main id="main" className="directory">
        <div className="section-eyebrow">Small acts. Shared possibilities.</div>
        <h1>
          Good things happen
          <br />
          when we show up.
        </h1>
        <p className="directory-intro">
          Real stories. People with a purpose. Find a campaign that speaks to
          you and help it take the next step.
        </p>
        <div className="campaign-grid" id="campaigns">
          {campaigns?.map((campaign) => (
            <Link
              key={campaign.id}
              className="campaign-tile"
              href={`/campaigns/${campaign.slug}`}
            >
              <div className="tile-image">
                {campaign.coverImageUrl && (
                  <Image
                    src={campaign.coverImageUrl}
                    alt={`Cover for ${campaign.title}`}
                    fill
                    sizes="(max-width: 540px) 100vw, 400px"
                  />
                )}
              </div>
              <div className="tile-content">
                <span className="category-tag">{campaign.category.name}</span>
                <h2>{campaign.title}</h2>
                <p>{campaign.summary}</p>
                <div className="tile-meta">
                  <strong>
                    {formatMoney(
                      BigInt(campaign.raisedAmount),
                      campaign.currency,
                    )}{' '}
                    raised
                  </strong>
                  <ArrowUpRight size={18} aria-hidden="true" />
                </div>
              </div>
            </Link>
          ))}
        </div>
        {campaigns === null && (
          <p className="empty-copy">
            Campaigns couldn’t be loaded. Refresh the page to try again.
          </p>
        )}
        {campaigns?.length === 0 && (
          <p className="empty-copy">
            There are no active campaigns yet. Check back for new stories.
          </p>
        )}
        <section className="directory-about" id="about">
          <h2>Fundraising, made for community.</h2>
          <p>
            OpenRaise is open-source crowdfunding for African communities.
            Campaigns share their story, donors see their fees before giving,
            and confirmed payments are recorded in the ledger.
          </p>
          <a
            href="https://github.com/ossycodes/openraise"
            target="_blank"
            rel="noreferrer"
          >
            Discover the project <ArrowUpRight size={15} />
          </a>
        </section>
        <section id="giving-details" className="directory-about">
          <h2>A clear path from kindness to support.</h2>
          <p>
            Choose a campaign, pick your amount and review the fees. Give as a
            guest through the payment provider’s hosted checkout. Your receipt
            is emailed after payment confirmation.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
