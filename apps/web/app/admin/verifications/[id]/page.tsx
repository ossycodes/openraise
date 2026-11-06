import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, IdCard, ImageOff, ShieldCheck } from 'lucide-react';
import { apiAs, ApiError } from '../../../_lib/api';
import { DOCUMENT_LABEL } from '../../../dashboard/_lib/types';
import { IdentityDecisionForm } from '../../_components/identity-decision-form';
import { reviewDate } from '../../types';
import { STATUS_TEXT, type VerificationDetail } from '../types';

export const metadata = { title: 'Identity check' };

/** Whole years from a YYYY-MM-DD birth date to today. */
function age(dob: string) {
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  let years = now.getUTCFullYear() - y;
  if (month < m || (month === m && now.getUTCDate() < d)) years--;
  return years;
}

export default async function VerificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ recorded?: string }>;
}) {
  const { id } = await params;
  let d: VerificationDetail;
  try {
    d = await apiAs<VerificationDetail>(
      `/admin/kyc/${encodeURIComponent(id)}`,
      { returnTo: `/admin/verifications/${id}` },
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
  const { verification: v, user, history } = d;
  return (
    <>
      <Link className="review-back" href="/admin/verifications">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to identity checks
      </Link>
      <div className="review-detail-heading">
        <div className="section-eyebrow">
          Identity check · sent {reviewDate(v.createdAt)}
        </div>
        <h1>{v.legalName}</h1>
        <div className="review-detail-meta">
          <span
            className={`review-status ${v.status === 'PENDING' ? 'is-pending' : ''}`}
          >
            {STATUS_TEXT[v.status]}
          </span>
          <span>
            <IdCard size={15} aria-hidden="true" />
            {DOCUMENT_LABEL[v.documentType]}
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
          <section className="identity-document">
            <h2>ID photo</h2>
            {v.hasDocument ? (
              // Private, uncached bytes for this reviewer; not for next/image.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/admin/verifications/${v.id}/document`}
                alt={`${DOCUMENT_LABEL[v.documentType]} sent by ${v.legalName}`}
              />
            ) : (
              <p className="identity-no-document">
                <ImageOff size={20} aria-hidden="true" />
                {v.status === 'REJECTED'
                  ? 'The photo was deleted when this check was declined.'
                  : 'No photo was sent with this check.'}
              </p>
            )}
            <small>
              Don’t download, copy or screenshot this photo. It is shown here
              only to make this decision.
            </small>
          </section>
          <section className="review-history">
            <h2>Earlier checks for this account</h2>
            {history.length ? (
              history.map((h) => (
                <article key={h.id}>
                  <div>
                    <span className="review-history-dot" />
                    <strong>{STATUS_TEXT[h.status]}</strong>
                    <time dateTime={h.createdAt}>
                      {reviewDate(h.createdAt)}
                    </time>
                  </div>
                  <small>
                    {DOCUMENT_LABEL[h.documentType]} ending {h.idNumberLast4}
                    {h.reviewer ? ` · by ${h.reviewer.name}` : ''}
                  </small>
                  {h.reason && <p>{h.reason}</p>}
                </article>
              ))
            ) : (
              <p>This is the first check for this account.</p>
            )}
          </section>
        </div>
        <aside className="review-sidebar">
          <section className="review-facts">
            <div className="section-eyebrow">What they entered</div>
            <dl>
              <div>
                <dt>Full name</dt>
                <dd>{v.legalName}</dd>
              </div>
              <div>
                <dt>Date of birth</dt>
                <dd>
                  {reviewDate(`${v.dateOfBirth}T12:00:00Z`)} (
                  {age(v.dateOfBirth)})
                </dd>
              </div>
              <div>
                <dt>Document number</dt>
                <dd>Ending {v.idNumberLast4}</dd>
              </div>
              <div>
                <dt>Account</dt>
                <dd>
                  {user.name}
                  <br />
                  {user.email}
                </dd>
              </div>
              <div>
                <dt>Account created</dt>
                <dd>{reviewDate(user.createdAt)}</dd>
              </div>
            </dl>
            <p className="review-email-status">
              <ShieldCheck size={17} aria-hidden="true" />
              {user.emailVerified
                ? 'Email address verified'
                : 'Email not verified'}
            </p>
          </section>
          {v.status === 'PENDING' ? (
            <IdentityDecisionForm
              key={v.updatedAt}
              id={v.id}
              version={v.updatedAt}
              legalName={v.legalName}
            />
          ) : (
            <section className="review-completed">
              <h2>
                {v.status === 'VERIFIED'
                  ? `Verified as ${v.verifiedName}`
                  : 'Not verified'}
              </h2>
              <p>
                Decided {reviewDate(v.decidedAt)}
                {v.reviewer ? ` by ${v.reviewer.name}` : ''}.
              </p>
              {v.reason && <blockquote>{v.reason}</blockquote>}
              <Link className="primary-button" href="/admin/verifications">
                Review another check
              </Link>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
