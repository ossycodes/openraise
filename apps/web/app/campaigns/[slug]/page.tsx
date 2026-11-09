import { MoneyTrail } from '../../_components/money-trail';
import { getMoneyTrail } from '../../_lib/campaign-server';
import { ReportForm } from '../../_components/report-form';
import { UpdatesFeed } from '../../_components/updates-feed';
import { getUpdates } from '../../_lib/campaign-server';
import type { Metadata } from 'next';
import { Contributors } from '../../_components/contributors';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  CalendarDays,
  GraduationCap,
  Heart,
  MapPin,
  Sprout,
} from 'lucide-react';
import { formatMoney } from '@openraise/shared';
import { CampaignMedia } from '../../_components/campaign-media';
import { DonationPanel } from '../../_components/donation-panel';
import { ShareButton } from '../../_components/share-button';
import { SiteFooter, SiteHeader } from '../../_components/site-header';
import {
  apiOrigin,
  CampaignLoadError,
  getCampaign,
  getSupporters,
  initialQuote,
  previewEnabled,
  webOrigin,
} from '../../_lib/campaign-server';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  try {
    const campaign = await getCampaign((await params).slug);
    return {
      // The root layout's title template adds the deployment's name.
      title: campaign.title,
      description: campaign.summary,
      alternates: { canonical: `${webOrigin()}/campaigns/${campaign.slug}` },
      robots: previewEnabled() ? { index: false, follow: false } : undefined,
      openGraph: {
        title: campaign.title,
        description: campaign.summary,
        type: 'website',
        images: [`/campaigns/${campaign.slug}/opengraph-image`],
      },
      twitter: { card: 'summary_large_image' },
    };
  } catch {
    return {
      title: 'Campaign unavailable',
      robots: { index: false },
    };
  }
}
export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ updatesPage?: string; moneyPage?: string }>;
}) {
  const query = await searchParams;
  const requestedMoneyPage = Number(query.moneyPage ?? 1);
  const moneyPage =
    Number.isInteger(requestedMoneyPage) &&
    requestedMoneyPage >= 1 &&
    requestedMoneyPage <= 1000
      ? requestedMoneyPage
      : 1;
  const requestedPage = Number(query.updatesPage ?? 1);
  const updatesPage =
    Number.isInteger(requestedPage) &&
    requestedPage >= 1 &&
    requestedPage <= 1000
      ? requestedPage
      : 1;
  let campaign;
  try {
    campaign = await getCampaign((await params).slug);
  } catch (error) {
    if (error instanceof CampaignLoadError && error.status === 404) notFound();
    throw error;
  }
  const [quote, supporters, topSupporters, feeResponse, updates, moneyTrail] =
    await Promise.all([
      initialQuote(campaign),
      getSupporters(campaign.slug),
      getSupporters(campaign.slug, 'top'),
      fetch(`${apiOrigin()}/config/fees`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
      getUpdates(campaign.slug, updatesPage),
      getMoneyTrail(campaign.slug, moneyPage),
    ]);
  const initials = campaign.owner.name
    .split(' ')
    .map((value) => value[0])
    .slice(0, 2)
    .join('');
  const paragraphs = campaign.story.split(/\n\s*\n/).filter(Boolean);
  const preview = previewEnabled();
  const date = (value: string) =>
    new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeZone: 'Africa/Lagos',
    }).format(new Date(value));
  return (
    <>
      <SiteHeader preview={preview} />
      <main id="main" className="campaign-main">
        <div className="campaign-topline">
          <a className="back-link" href="/">
            <ArrowLeft size={15} aria-hidden="true" />
            All campaigns
          </a>
          <ShareButton
            title={campaign.title}
            shortCode={campaign.shortCode}
            compact
          />
        </div>
        <div className="campaign-layout">
          <div className="campaign-content">
            <div className="campaign-heading enter">
              <div className="campaign-tags">
                <span className="category-tag">
                  <GraduationCap size={15} aria-hidden="true" />
                  {campaign.category.name}
                </span>
                {campaign.location && (
                  <span className="location-tag">
                    <MapPin size={14} aria-hidden="true" />
                    {campaign.location}
                  </span>
                )}
              </div>
              <h1>{campaign.title}</h1>
              <p className="campaign-summary">{campaign.summary}</p>
            </div>
            <CampaignMedia
              key={`${campaign.id}:${campaign.videoUrl ?? 'photos'}`}
              campaign={campaign}
            />
            <div className="organiser-line">
              <div className="avatar">{initials}</div>
              <div>
                <span>
                  Organised by <strong>{campaign.owner.name}</strong>
                </span>
                <small>
                  {campaign.beneficiaryName
                    ? `For ${campaign.beneficiaryName}`
                    : 'Campaign organiser'}
                  {campaign.publishedAt
                    ? ` · Started ${date(campaign.publishedAt)}`
                    : ''}
                </small>
              </div>
              <Sprout
                className="organiser-sprout"
                size={27}
                strokeWidth={1.3}
                aria-hidden="true"
              />
            </div>
            <nav className="story-nav" aria-label="Campaign sections">
              <a href="#story" className="active">
                The story
              </a>
              <a href="#updates">Updates</a>
              <a href="#money-trail">Money trail</a>
              <a href="#supporters">
                Supporters <span>{campaign.donorCount}</span>
              </a>
              <a href="#giving-details">Giving details</a>
            </nav>
            <section className="story-section" id="story">
              <div className="section-eyebrow">
                A little context. A lot of heart.
              </div>
              <h2>The story behind the fundraiser</h2>
              {paragraphs.length ? (
                paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))
              ) : (
                <p>The organiser hasn’t shared their story yet.</p>
              )}
              <div className="story-quote">
                <span className="quote-mark" aria-hidden="true">
                  “
                </span>
                <p>
                  Big possibilities start with people showing up for each other.
                </p>
                <Sprout size={30} strokeWidth={1.3} aria-hidden="true" />
              </div>
            </section>
            <ReportForm slug={campaign.slug} />
            <UpdatesFeed updates={updates} />
            <MoneyTrail trail={moneyTrail} updatesPage={updatesPage} />
            <section id="supporters" className="supporters-section">
              <div className="section-title-row">
                <div>
                  <div className="section-eyebrow">
                    Every gift is part of the story
                  </div>
                  <h2>A community showing up</h2>
                </div>
                <span className="supporter-count">
                  <Heart size={15} aria-hidden="true" />
                  {campaign.donorCount}
                </span>
              </div>
              <Contributors recent={supporters} top={topSupporters} />
              <p className="privacy-note">
                Only confirmed donations appear here. Names are shown only when
                supporters choose to share them; rankings remain anonymous.
              </p>
            </section>
            <section id="giving-details" className="giving-details">
              <div className="section-eyebrow">A clearer way to give</div>
              <h2>Good questions. Clear answers.</h2>
              <details>
                <summary>Where does my donation go?</summary>
                <p>
                  Your donation is credited to this campaign’s wallet after
                  payment confirmation. You’ll see the exact fees and net amount
                  before continuing to the payment provider.
                </p>
              </details>
              <details>
                <summary>Do I need an account to donate?</summary>
                <p>
                  No. Give as a guest with your email address so a receipt can
                  be sent after your payment is confirmed.
                </p>
              </details>
              <details>
                <summary>Why are there fees?</summary>
                <p>
                  Platform fees support the service and processing fees support
                  collecting payments. Covering the platform fee is optional.
                  The total you’ll pay is shown before checkout.
                </p>
                {feeResponse && (
                  <p>
                    The configured withdrawal fee is{' '}
                    {formatMoney(
                      BigInt(feeResponse.withdrawalFee),
                      feeResponse.currency,
                    )}{' '}
                    per withdrawal. It is not an extra charge on your donation.
                  </p>
                )}
              </details>
              <details>
                <summary>How will I know my payment went through?</summary>
                <p>
                  Return to this campaign after paying and check your payment
                  status. Only confirmation from the payment provider marks a
                  donation as paid. A receipt is then queued for email delivery.
                </p>
              </details>
            </section>
            <div className="campaign-bottom-meta">
              <CalendarDays size={14} aria-hidden="true" />
              Created {date(campaign.createdAt)}
              <span>·</span>
              {campaign.category.name}
            </div>
          </div>
          <DonationPanel
            campaign={campaign}
            initial={quote}
            withdrawal={
              feeResponse
                ? {
                    amount: feeResponse.withdrawalFee,
                    currency: feeResponse.currency,
                  }
                : null
            }
          />
        </div>
        <div className="community-banner">
          <Sprout size={36} strokeWidth={1.2} aria-hidden="true" />
          <div>
            <h2>Some stories just need a few more people.</h2>
            <p>If this one moved you, help it find its next supporter.</p>
          </div>
          <ShareButton title={campaign.title} shortCode={campaign.shortCode} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
