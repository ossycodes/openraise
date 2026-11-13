import { OperationForm } from '../../_components/operation-form';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatMoney } from '@openraise/shared';
import {
  MapPin,
  UserRound,
  CalendarDays,
  ShieldCheck,
  ArrowLeft,
} from 'lucide-react';
import { apiAs, ApiError } from '../../../_lib/api';
import { CampaignMedia } from '../../../_components/campaign-media';
import { DecisionForm } from '../../_components/decision-form';
import { reviewDate, type ReviewDetail } from '../../types';
import { STATUS_LABEL } from '../../../dashboard/_lib/types';
export default async function CampaignReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let detail: ReviewDetail;
  try {
    detail = await apiAs<ReviewDetail>(
      `/admin/campaigns/${encodeURIComponent(id)}`,
      { returnTo: `/admin/campaigns/${id}` },
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    if (e instanceof ApiError && e.status === 403)
      return (
        <p>
          Administrator access needed.{' '}
          <Link href="/dashboard">Return to dashboard</Link>
        </p>
      );
    throw e;
  }
  const { campaign: c, organiser, reviews } = detail;
  return (
    <>
      <Link className="review-back" href="/admin/campaigns">
        <ArrowLeft size={16} aria-hidden="true" /> Back to review queue
      </Link>
      <div className="review-detail-heading">
        <div className="section-eyebrow">
          Campaign submission <span>·</span> {c.category.name}
        </div>
        <h1>{c.title}</h1>
        <div className="review-detail-meta">
          <span
            className={`review-status ${c.status === 'PENDING_REVIEW' ? 'is-pending' : ''}`}
          >
            {STATUS_LABEL[c.status]}
          </span>
          <span>
            <MapPin size={15} aria-hidden="true" />
            {c.location ?? 'Location not provided'}
          </span>
          <span>
            <CalendarDays size={15} aria-hidden="true" />
            Submitted {reviewDate(c.submittedAt)}
          </span>
        </div>
      </div>
      <div className="review-detail-grid">
        <div className="review-submission">
          <CampaignMedia campaign={c} />
          <section className="review-story">
            <div className="section-eyebrow">In the creator’s words</div>
            <h2>The story behind the campaign</h2>
            <p className="review-summary">{c.summary}</p>
            <p className="review-story-text">
              {c.story || 'No story provided.'}
            </p>
          </section>
          <section className="review-history">
            <h2>Review history</h2>
            {reviews.length ? (
              reviews.map((r) => (
                <article key={r.id}>
                  <div>
                    <span className="review-history-dot" />
                    <strong>
                      {r.decision === 'APPROVE'
                        ? 'Approved for publishing'
                        : 'Returned for changes'}
                    </strong>
                    <time dateTime={r.createdAt}>
                      {reviewDate(r.createdAt)}
                    </time>
                  </div>
                  <small>Reviewed by {r.reviewer.name}</small>
                  {r.reason && <p>{r.reason}</p>}
                </article>
              ))
            ) : (
              <p>
                No decisions recorded yet. This submission is ready for its
                first review.
              </p>
            )}
          </section>
        </div>
        <aside className="review-sidebar">
          <section className="review-facts">
            <div className="section-eyebrow">At a glance</div>
            <div className="review-goal">
              {formatMoney(BigInt(c.goalAmount), c.currency)}
              <span>Fundraising goal</span>
            </div>
            <dl>
              <div>
                <dt>
                  <UserRound size={15} aria-hidden="true" />
                  Organiser
                </dt>
                <dd>{organiser.name}</dd>
              </div>
              <div>
                <dt>Beneficiary</dt>
                <dd>{c.beneficiaryName ?? 'Not specified'}</dd>
              </div>
              <div>
                <dt>Campaign ends</dt>
                <dd>{c.endsAt ? reviewDate(c.endsAt) : 'No end date'}</dd>
              </div>
              <div>
                <dt>Account created</dt>
                <dd>{reviewDate(organiser.createdAt)}</dd>
              </div>
            </dl>
            <p className="review-email-status">
              <ShieldCheck size={17} aria-hidden="true" />
              {organiser.emailVerified
                ? 'Email address verified'
                : 'Email not verified'}
            </p>
            <p
              className={`review-email-status${organiser.identityVerified ? '' : ' is-missing'}`}
            >
              <ShieldCheck size={17} aria-hidden="true" />
              {organiser.identityVerified
                ? `Identity verified as ${organiser.verifiedName}`
                : 'Identity not verified'}
              <small>
                {organiser.identityVerified
                  ? 'Check the name matches the beneficiary or story.'
                  : 'Approval waits until the organiser’s identity is verified.'}
              </small>
            </p>
          </section>
          {c.status === 'PENDING_REVIEW' ? (
            <DecisionForm key={c.updatedAt} id={c.id} version={c.updatedAt} />
          ) : (
            <section className="review-completed">
              <h2>
                {c.status === 'REJECTED'
                  ? 'This campaign needs changes.'
                  : `This campaign is ${STATUS_LABEL[c.status].toLowerCase()}.`}
              </h2>
              <p>Only submissions awaiting review can receive a decision.</p>
              {c.rejectionReason && (
                <blockquote>{c.rejectionReason}</blockquote>
              )}
              {['ACTIVE', 'PAUSED', 'ENDED'].includes(c.status) && (
                <Link href={`/campaigns/${c.slug}`}>
                  View public campaign ↗
                </Link>
              )}
              <Link className="primary-button" href="/admin/campaigns">
                Review another campaign
              </Link>
            </section>
          )}
          {['ACTIVE', 'PAUSED', 'ENDED'].includes(c.status) && <OperationForm key={`controls-${c.updatedAt}`} title="Campaign controls" description={`Featured: ${c.featured ? 'yes' : 'no'}. Payouts: ${c.payoutsFrozen ? 'frozen' : 'available'}. Every change records your reason in the audit history.`} path={`campaigns/${c.id}/actions`} fixed={{ expectedUpdatedAt: c.updatedAt }} fields={[{ name: 'action', label: 'Action', options: [
            ...(c.status === 'ACTIVE' ? [{ value: c.featured ? 'UNFEATURE' : 'FEATURE', label: c.featured ? 'Remove from featured' : 'Feature campaign' }, { value: 'PAUSE', label: 'Pause campaign' }] : []),
            ...(c.status === 'PAUSED' ? [{ value: 'RESUME', label: 'Resume campaign' }] : []),
            ...(['ACTIVE', 'PAUSED'].includes(c.status) ? [{ value: 'END', label: 'End campaign permanently' }] : []),
            { value: c.payoutsFrozen ? 'UNFREEZE_PAYOUTS' : 'FREEZE_PAYOUTS', label: c.payoutsFrozen ? 'Lift payout freeze' : 'Freeze payouts' },
          ] }]} confirmation="I have reviewed this campaign and the effect of this action." submitLabel="Apply action" />}
        </aside>
      </div>
    </>
  );
}
