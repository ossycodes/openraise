import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Landmark, ShieldCheck } from 'lucide-react';
import { apiAs, ApiError } from '../../../_lib/api';
import { NameReviewDecisionForm } from '../../_components/name-review-decision-form';
import { reviewDate } from '../../types';
import { REVIEW_STATUS_TEXT, type NameReviewDetail } from '../types';

export const metadata = { title: 'Payout name review' };

export default async function PayoutNamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ recorded?: string }>;
}) {
  const { id } = await params;
  let d: NameReviewDetail;
  try {
    d = await apiAs<NameReviewDetail>(
      `/admin/payout-names/${encodeURIComponent(id)}`,
      { returnTo: `/admin/payout-names/${id}` },
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
  const { review: r, user, account, history } = d;
  const nameChanged =
    d.currentVerifiedName !== null && d.currentVerifiedName !== r.verifiedName;
  return (
    <>
      <Link className="review-back" href="/admin/payout-names">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to payout names
      </Link>
      <div className="review-detail-heading">
        <div className="section-eyebrow">
          Payout name review · asked {reviewDate(r.createdAt)}
        </div>
        <h1>{user.name}</h1>
        <div className="review-detail-meta">
          <span
            className={`review-status ${r.status === 'PENDING' ? 'is-pending' : ''}`}
          >
            {REVIEW_STATUS_TEXT[r.status]}
          </span>
          <span>
            <Landmark size={15} aria-hidden="true" />
            {account.bankName} {account.maskedAccountNumber}
          </span>
        </div>
      </div>
      {(await searchParams).recorded === '1' && (
        <p className="dashboard-notice" role="status">
          Decision recorded. The creator has been emailed.
        </p>
      )}
      <div className="review-detail-grid">
        <div className="review-submission">
          <section className="name-compare" aria-labelledby="compare-title">
            <h2 id="compare-title">The two names</h2>
            <dl>
              <div>
                <dt>Verified identity</dt>
                <dd>{r.verifiedName}</dd>
              </div>
              <div>
                <dt>Bank account</dt>
                <dd>{r.accountName}</dd>
              </div>
            </dl>
            {nameChanged && (
              <p className="field-error">
                Their verified name is now {d.currentVerifiedName}, so this
                request can only be declined.
              </p>
            )}
          </section>
          <section className="name-explanation">
            <h2>Their explanation</h2>
            <blockquote>{r.explanation}</blockquote>
          </section>
          <section className="review-history">
            <h2>Earlier requests for this account</h2>
            {history.length ? (
              history.map((h) => (
                <article key={h.id}>
                  <div>
                    <span className="review-history-dot" />
                    <strong>{REVIEW_STATUS_TEXT[h.status]}</strong>
                    <time dateTime={h.createdAt}>{reviewDate(h.createdAt)}</time>
                  </div>
                  <small>
                    {h.explanation}
                    {h.reviewer ? ` · decided by ${h.reviewer.name}` : ''}
                  </small>
                  {h.reason && <p>{h.reason}</p>}
                </article>
              ))
            ) : (
              <p>This is the first request for this account.</p>
            )}
          </section>
        </div>
        <aside className="review-sidebar">
          <section className="review-facts">
            <div className="section-eyebrow">The account</div>
            <dl>
              <div>
                <dt>Bank</dt>
                <dd>
                  {account.bankName} {account.maskedAccountNumber}
                </dd>
              </div>
              <div>
                <dt>Added</dt>
                <dd>{reviewDate(account.createdAt)}</dd>
              </div>
              <div>
                <dt>Withdrawals to it</dt>
                <dd>{account.withdrawals}</dd>
              </div>
              <div>
                <dt>Creator</dt>
                <dd>
                  {user.name}
                  <br />
                  {user.email}
                </dd>
              </div>
            </dl>
            <p className="review-email-status">
              <ShieldCheck size={17} aria-hidden="true" />
              {account.removed
                ? 'The creator removed this account'
                : 'Bank confirmed the account name'}
            </p>
          </section>
          {r.status === 'PENDING' ? (
            <NameReviewDecisionForm
              key={r.updatedAt}
              id={r.id}
              version={r.updatedAt}
              canApprove={!account.removed && !nameChanged}
            />
          ) : (
            <section className="review-completed">
              <h2>{REVIEW_STATUS_TEXT[r.status]}</h2>
              <p>
                {r.status === 'CANCELLED' ? 'Closed' : 'Decided'}{' '}
                {reviewDate(r.decidedAt)}
                {r.reviewer ? ` by ${r.reviewer.name}` : ''}.
              </p>
              {r.reason && <blockquote>{r.reason}</blockquote>}
              <Link className="primary-button" href="/admin/payout-names">
                Review another request
              </Link>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
