import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatMoney } from '@openraise/shared';
import { ArrowLeft, ArrowUpRight, CircleAlert, Clock } from 'lucide-react';
import { CampaignForm } from '../../_components/campaign-form';
import { CampaignTabs } from '../../_components/dashboard-nav';
import { PhotoManager } from '../../_components/photo-manager';
import { StatusActions } from '../../_components/status-actions';
import { IdentityCallout } from '../../_components/identity-callout';
import { categories, identity, myCampaigns } from '../../_lib/data';
import { canEdit, STATUS_LABEL, type CampaignStatus } from '../../_lib/types';

const STATUS_HELP: Record<CampaignStatus, string> = {
  DRAFT:
    'Only you can see this draft. Submit it when the story, goal and photos are ready.',
  PENDING_REVIEW:
    'We’re checking your campaign. You can’t edit it during review; we’ll email you when it’s live.',
  ACTIVE: 'Your campaign is live and taking donations.',
  PAUSED:
    'Donations are paused. Your page is still visible; resume whenever you’re ready.',
  ENDED: 'This campaign has ended and no longer takes donations.',
  REJECTED:
    'Your campaign needs changes before it can go live. Edit it and submit again.',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = (await myCampaigns(`/dashboard/campaigns/${id}`)).find(
    (c) => c.id === id,
  );
  return { title: campaign ? campaign.title : 'Campaign' };
}

export default async function EditCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const [mine, cats, { created }, kyc] = await Promise.all([
    myCampaigns(`/dashboard/campaigns/${id}`),
    categories(),
    searchParams,
    identity(`/dashboard/campaigns/${id}`),
  ]);
  const campaign = mine.find((c) => c.id === id);
  if (!campaign) notFound();
  const isPublic = ['ACTIVE', 'PAUSED', 'ENDED'].includes(campaign.status);

  return (
    <>
      <Link href="/dashboard" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" /> Your campaigns
      </Link>
      <div className="dashboard-heading">
        <div>
          <span
            className={`status-pill status-${campaign.status.toLowerCase()}`}
          >
            {STATUS_LABEL[campaign.status]}
          </span>
          <h1>{campaign.title}</h1>
          <p className="dashboard-lede">
            {formatMoney(BigInt(campaign.raisedAmount), campaign.currency)}{' '}
            raised of{' '}
            {formatMoney(BigInt(campaign.goalAmount), campaign.currency)} from{' '}
            {campaign.donorCount}{' '}
            {campaign.donorCount === 1 ? 'supporter' : 'supporters'}
          </p>
        </div>
        {isPublic && (
          <Link
            className="secondary-button"
            href={`/campaigns/${campaign.slug}`}
          >
            View public page <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>

      <CampaignTabs id={campaign.id} />

      {created && (
        <p className="dashboard-notice" role="status">
          Draft saved. Add a cover photo, then submit it for review.
        </p>
      )}

      <div className="dashboard-columns">
        <div className="dashboard-main">
          <section className="dashboard-panel" aria-labelledby="photos-title">
            <h2 id="photos-title">Photos</h2>
            <PhotoManager
              campaignId={campaign.id}
              images={campaign.images}
              editable={canEdit(campaign.status)}
            />
          </section>
          <section className="dashboard-panel" aria-labelledby="details-title">
            <h2 id="details-title">Details</h2>
            <CampaignForm campaign={campaign} categories={cats} />
          </section>
        </div>
        <aside className="dashboard-side">
          <section className="dashboard-panel" aria-labelledby="status-title">
            <h2 id="status-title">Status</h2>
            {campaign.status === 'REJECTED' && campaign.rejectionReason && (
              <div className="review-note">
                <CircleAlert size={18} aria-hidden="true" />
                <div>
                  <strong>What to change</strong>
                  <p>{campaign.rejectionReason}</p>
                </div>
              </div>
            )}
            {campaign.status === 'PENDING_REVIEW' && (
              <div className="review-note waiting">
                <Clock size={18} aria-hidden="true" />
                <p>Submitted for review.</p>
              </div>
            )}
            <p className="field-hint">
              {campaign.moderationPaused
                ? `An administrator has paused this campaign: ${campaign.moderationPauseReason ?? 'Under review'}. You can resume after the restriction is lifted.`
                : STATUS_HELP[campaign.status]}
            </p>
            {(campaign.status === 'DRAFT' ||
              campaign.status === 'REJECTED') && (
              <IdentityCallout status={kyc.status} purpose="publish" />
            )}
            <StatusActions
              id={campaign.id}
              status={campaign.status}
              moderationPaused={campaign.moderationPaused}
            />
          </section>
        </aside>
      </div>
    </>
  );
}
