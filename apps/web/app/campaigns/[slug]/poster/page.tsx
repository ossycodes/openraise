import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download, HandHeart } from 'lucide-react';
import { formatMoney } from '@openraise/shared';
import { progressPercent } from '../../../_lib/campaign';
import { CampaignLoadError, getCampaign } from '../../../_lib/campaign-server';
import { qrSvg, shortLabel, shortUrl } from '../../../_lib/qr';
import { getSite } from '../../../_lib/site';
import { PrintButton } from './print-button';

export const metadata: Metadata = {
  title: 'Printable poster',
  robots: { index: false, follow: false },
};

const asOf = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Africa/Lagos',
});

/**
 * An A4 poster for noticeboards at churches, mosques, offices and schools:
 * the story at a glance, a QR code and a short link for people who can't scan.
 */
export default async function PosterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let campaign;
  try {
    campaign = await getCampaign(slug);
  } catch (error) {
    if (error instanceof CampaignLoadError && error.status === 404) notFound();
    throw error;
  }
  const site = await getSite();
  const percent = Math.min(
    100,
    progressPercent(campaign.raisedAmount, campaign.goalAmount),
  );
  // Generated from our own short link, never from user input, so it's safe
  // to inline; inline SVG stays sharp at any print size.
  const qr = await qrSvg(shortUrl(campaign.shortCode));
  return (
    <main className="poster-screen">
      <div className="poster-toolbar">
        <Link href={`/campaigns/${campaign.slug}`} className="review-back">
          <ArrowLeft size={16} aria-hidden="true" /> Back to campaign
        </Link>
        <div>
          <a
            className="secondary-button"
            href={`/campaigns/${campaign.slug}/qr?format=png&download=1`}
          >
            <Download size={16} aria-hidden="true" /> QR code (PNG)
          </a>
          <a
            className="secondary-button"
            href={`/campaigns/${campaign.slug}/qr?format=svg&download=1`}
          >
            <Download size={16} aria-hidden="true" /> QR code (SVG)
          </a>
          <PrintButton />
        </div>
      </div>
      <p className="poster-hint">
        Prints on one A4 sheet. Totals are as of today; the QR code always opens
        the live campaign.
      </p>

      <article className="poster" aria-label={`Poster for ${campaign.title}`}>
        <header className="poster-brand">
          {site.name}
          <span>{campaign.category.name}</span>
        </header>
        <div className="poster-cover">
          {campaign.coverImageUrl ? (
            // A plain img prints reliably; next/image's lazy loading can leave
            // the cover blank on paper.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={campaign.coverImageUrl} alt="" />
          ) : (
            <HandHeart size={90} strokeWidth={1} aria-hidden="true" />
          )}
        </div>
        <h1>{campaign.title}</h1>
        {campaign.summary && <p className="poster-summary">{campaign.summary}</p>}
        <div className="poster-progress">
          <div>
            <strong>
              {formatMoney(BigInt(campaign.raisedAmount), campaign.currency)}
            </strong>{' '}
            raised of{' '}
            {formatMoney(BigInt(campaign.goalAmount), campaign.currency)}
          </div>
          <div className="poster-bar" aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </div>
          <small>
            {campaign.donorCount}{' '}
            {campaign.donorCount === 1 ? 'supporter' : 'supporters'} · as of{' '}
            {asOf.format(new Date())}
          </small>
        </div>
        <footer className="poster-give">
          <div
            className="poster-qr"
            role="img"
            aria-label={`QR code for ${shortLabel(campaign.shortCode)}`}
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <div>
            <h2>Scan to give</h2>
            <p>Point your phone camera at the code, or type this address:</p>
            <strong className="poster-link">
              {shortLabel(campaign.shortCode)}
            </strong>
            <small>Every fee is shown before you pay.</small>
          </div>
        </footer>
      </article>
    </main>
  );
}
