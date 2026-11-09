import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, HandHeart, Heart } from 'lucide-react';
import { formatMoney } from '@openraise/shared';
import { progressPercent, type Campaign } from '../_lib/campaign';

/** A campaign card for directories: cover, category, story, progress. */
export function CampaignTile({ campaign }: { campaign: Campaign }) {
  const percent = progressPercent(campaign.raisedAmount, campaign.goalAmount);
  return (
    <Link className="campaign-tile" href={`/campaigns/${campaign.slug}`}>
      <div className="tile-image">
        {campaign.coverImageUrl ? (
          <Image
            src={campaign.coverImageUrl}
            alt={`Cover for ${campaign.title}`}
            fill
            sizes="(max-width: 540px) 100vw, 400px"
          />
        ) : (
          <HandHeart size={45} strokeWidth={1.2} aria-hidden="true" />
        )}
        <span className="tile-category">{campaign.category.name}</span>
      </div>
      <div className="tile-content">
        <h3>{campaign.title}</h3>
        <p>{campaign.summary}</p>
        <div
          className="tile-progress"
          role="progressbar"
          aria-label={`${campaign.title} fundraising progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, percent)}
        >
          <span style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
        <div className="tile-meta">
          <strong>
            {formatMoney(BigInt(campaign.raisedAmount), campaign.currency)}{' '}
            <span>raised</span>
          </strong>
          <span>{Math.round(percent)}%</span>
        </div>
        <div className="tile-bottom">
          <span>
            <Heart size={14} aria-hidden="true" /> {campaign.donorCount}{' '}
            supporters
          </span>
          <ArrowUpRight size={19} aria-hidden="true" />
        </div>
      </div>
    </Link>
  );
}
