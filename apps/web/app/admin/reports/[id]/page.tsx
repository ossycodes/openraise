import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Flag, LockKeyhole, Pause } from 'lucide-react';
import { apiAs, ApiError } from '../../../_lib/api';
import { CampaignMedia } from '../../../_components/campaign-media';
import { reviewDate } from '../../types';
import { REPORT_CATEGORY, ACTION_LABEL, type ReportDetail } from '../types';
import { ModerationForm } from '../../_components/moderation-form';
export const metadata = { title: 'Review report' };
export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ recorded?: string }>;
}) {
  const { id } = await params;
  let d: ReportDetail;
  try {
    d = await apiAs<ReportDetail>(`/admin/reports/${encodeURIComponent(id)}`, {
      returnTo: `/admin/reports/${id}`,
    });
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
  const { report, campaign, controls, actions } = d;
  return (
    <>
      <Link className="review-back" href="/admin/reports">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to reports
      </Link>
      <div className="review-detail-heading">
        <div className="section-eyebrow">
          Private report · {reviewDate(report.createdAt)}
        </div>
        <h1>{campaign.title}</h1>
        <div className="review-detail-meta">
          <span
            className={`review-status ${report.status === 'OPEN' ? 'is-pending' : ''}`}
          >
            {report.status[0] + report.status.slice(1).toLowerCase()}
          </span>
          <span>
            <Flag size={15} aria-hidden="true" />
            {REPORT_CATEGORY[report.category]}
          </span>
          <span>Campaign {campaign.status.toLowerCase()}</span>
        </div>
      </div>
      {(await searchParams).recorded === '1' && (
        <p className="dashboard-notice" role="status">
          Action recorded. The latest report and campaign status are shown
          below.
        </p>
      )}
      <div className="review-detail-grid">
        <div className="review-submission">
          <section className="report-allegation">
            <div className="section-eyebrow">Visitor’s concern</div>
            <h2>{REPORT_CATEGORY[report.category]}</h2>
            <p className="report-text">{report.details}</p>
            <small>
              An allegation submitted by a visitor. Check it against the
              campaign before deciding.
            </small>
          </section>
          <div className="moderation-preview-heading">
            <h2>Campaign context</h2>
            <Link href={`/admin/campaigns/${campaign.id}`}>
              Full campaign review ↗
            </Link>
          </div>
          <CampaignMedia campaign={campaign} />
          <section className="review-story">
            <h2>In the organiser’s words</h2>
            <p className="review-summary">{campaign.summary}</p>
            <p className="review-story-text">{campaign.story}</p>
          </section>
          <section className="review-history">
            <h2>Moderation history</h2>
            {actions.length ? (
              actions.map((a) => (
                <article key={a.id}>
                  <div>
                    <span className="review-history-dot" />
                    <strong>{ACTION_LABEL[a.action]}</strong>
                    <time dateTime={a.createdAt}>
                      {reviewDate(a.createdAt)}
                    </time>
                  </div>
                  <small>By {a.actor.name}</small>
                  <p>{a.reason}</p>
                </article>
              ))
            ) : (
              <p>No actions have been recorded for this report.</p>
            )}
            {actions.length === 50 && (
              <small>Showing the latest 50 actions.</small>
            )}
          </section>
        </div>
        <aside className="review-sidebar">
          <section className="review-facts">
            <div className="section-eyebrow">Current restrictions</div>
            <div className="moderation-restriction">
              <Pause size={18} aria-hidden="true" />
              <div>
                <strong>
                  {controls.moderationPaused
                    ? 'Admin pause in place'
                    : 'No admin pause'}
                </strong>
                <p>
                  {controls.moderationPauseReason ??
                    'Creator controls follow the campaign’s current status.'}
                </p>
              </div>
            </div>
            <div className="moderation-restriction">
              <LockKeyhole size={18} aria-hidden="true" />
              <div>
                <strong>
                  {controls.payoutsFrozen
                    ? 'Payouts frozen'
                    : 'Payouts not frozen'}
                </strong>
                <p>
                  {controls.payoutFreezeReason ??
                    'Normal withdrawal checks still apply.'}
                </p>
              </div>
            </div>
          </section>
          <ModerationForm
            key={`${report.updatedAt}:${controls.updatedAt}`}
            detail={d}
          />
        </aside>
      </div>
    </>
  );
}
