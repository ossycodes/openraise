import Image from 'next/image';
import Link from 'next/link';
import { formatMoney } from '@openraise/shared';
import { ArrowUpRight, HandHeart, Plus, Sprout } from 'lucide-react';
import { progressPercent } from '../_lib/campaign';
import { getViewer } from '../_lib/session';
import { IdentityCallout } from './_components/identity-callout';
import { identity, myCampaigns } from './_lib/data';
import { STATUS_LABEL } from './_lib/types';

export const metadata = { title: 'Your campaigns' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const [campaigns, viewer, params, id] = await Promise.all([
    myCampaigns(),
    getViewer(),
    searchParams,
    identity(),
  ]);
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <div className="section-eyebrow">
            Welcome{viewer ? `, ${viewer.name.split(' ')[0]}` : ''}
          </div>
          <h1>Your campaigns</h1>
        </div>
        <Link className="primary-button" href="/dashboard/campaigns/new">
          <Plus size={18} aria-hidden="true" /> New campaign
        </Link>
      </div>
      <IdentityCallout status={id.status} purpose="start" />
      {params.deleted && (
        <p className="dashboard-notice" role="status">
          Draft deleted.
        </p>
      )}
      {campaigns.length === 0 ? (
        <div className="discovery-empty dashboard-empty">
          <Sprout size={32} aria-hidden="true" />
          <h2>Your first campaign starts here.</h2>
          <p>
            Write your story, set a goal and add a photo. You can save a draft
            and come back to it whenever you like.
          </p>
          <Link className="primary-button" href="/dashboard/campaigns/new">
            Start a campaign
          </Link>
        </div>
      ) : (
        <ul className="my-campaigns">
          {campaigns.map((c) => {
            const percent = Math.min(100, progressPercent(c.raisedAmount, c.goalAmount));
            return (
              <li key={c.id}>
                <Link href={`/dashboard/campaigns/${c.id}`} className="my-campaign">
                  <div className="my-campaign-photo">
                    {c.coverImageUrl ? (
                      <Image src={c.coverImageUrl} alt="" fill sizes="160px" />
                    ) : (
                      <HandHeart size={34} strokeWidth={1.2} aria-hidden="true" />
                    )}
                  </div>
                  <div className="my-campaign-body">
                    <span className={`status-pill status-${c.status.toLowerCase()}`}>
                      {STATUS_LABEL[c.status]}
                    </span>
                    <h2>{c.title}</h2>
                    <div
                      className="tile-progress"
                      role="progressbar"
                      aria-label={`${c.title} fundraising progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(percent)}
                    >
                      <span style={{ width: `${percent}%` }} />
                    </div>
                    <p>
                      <strong>{formatMoney(BigInt(c.raisedAmount), c.currency)}</strong> of{' '}
                      {formatMoney(BigInt(c.goalAmount), c.currency)} ·{' '}
                      {c.donorCount} {c.donorCount === 1 ? 'supporter' : 'supporters'}
                    </p>
                  </div>
                  <ArrowUpRight size={20} aria-hidden="true" className="my-campaign-arrow" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
