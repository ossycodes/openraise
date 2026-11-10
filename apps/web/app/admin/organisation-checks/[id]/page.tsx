import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, Building2, ImageOff } from 'lucide-react';
import { apiAs, ApiError } from '../../../_lib/api';
import { REGISTRATION_LABEL } from '../../../dashboard/organisations/types';
import { OrgDecisionForm } from '../../_components/org-decision-form';
import { reviewDate } from '../../types';
import { CHECK_STATUS_TEXT, type OrgCheckDetail } from '../types';

export const metadata = { title: 'Organisation check' };

export default async function OrganisationCheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ recorded?: string }>;
}) {
  const { id } = await params;
  let d: OrgCheckDetail;
  try {
    d = await apiAs<OrgCheckDetail>(
      `/admin/organisation-checks/${encodeURIComponent(id)}`,
      { returnTo: `/admin/organisation-checks/${id}` },
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
  const { verification: v, organisation: org, submittedBy, history } = d;
  return (
    <>
      <Link className="review-back" href="/admin/organisation-checks">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to organisation checks
      </Link>
      <div className="review-detail-heading">
        <div className="section-eyebrow">
          Organisation check · sent {reviewDate(v.createdAt)}
        </div>
        <h1>{v.registeredName}</h1>
        <div className="review-detail-meta">
          <span className={`review-status ${v.status === 'PENDING' ? 'is-pending' : ''}`}>
            {CHECK_STATUS_TEXT[v.status]}
          </span>
          <span>
            <Building2 size={15} aria-hidden="true" />
            {REGISTRATION_LABEL[v.registrationType]} {v.registrationNumber}
          </span>
        </div>
      </div>
      {(await searchParams).recorded === '1' && (
        <p className="dashboard-notice" role="status">
          Decision recorded. The organisation’s owners and admins have been emailed.
        </p>
      )}
      <div className="review-detail-grid">
        <div className="review-submission">
          <section className="identity-document">
            <h2>Registration certificate</h2>
            {v.hasDocument ? (
              // Private, uncached bytes for this reviewer; not for next/image.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/admin/organisation-checks/${v.id}/document`}
                alt={`Registration certificate sent for ${org.name}`}
              />
            ) : (
              <p className="identity-no-document">
                <ImageOff size={20} aria-hidden="true" />
                {v.status === 'REJECTED'
                  ? 'The photo was deleted when this check was declined.'
                  : 'No photo is stored for this check.'}
              </p>
            )}
            <small>
              Search the number on the CAC public register before deciding.
            </small>
          </section>
          <section className="review-history">
            <h2>Earlier checks for this organisation</h2>
            {history.length ? (
              history.map((h) => (
                <article key={h.id}>
                  <div>
                    <span className="review-history-dot" />
                    <strong>{CHECK_STATUS_TEXT[h.status]}</strong>
                    <time dateTime={h.createdAt}>{reviewDate(h.createdAt)}</time>
                  </div>
                  <small>
                    {h.registeredName} · {h.registrationNumber}
                    {h.reviewer ? ` · by ${h.reviewer.name}` : ''}
                  </small>
                  {h.reason && <p>{h.reason}</p>}
                </article>
              ))
            ) : (
              <p>This is the first check for this organisation.</p>
            )}
          </section>
        </div>
        <aside className="review-sidebar">
          <section className="review-facts">
            <div className="section-eyebrow">What they entered</div>
            <dl>
              <div>
                <dt>Name on the certificate</dt>
                <dd>{v.registeredName}</dd>
              </div>
              <div>
                <dt>Registration</dt>
                <dd>
                  {REGISTRATION_LABEL[v.registrationType]}
                  <br />
                  {v.registrationNumber}
                </dd>
              </div>
              <div>
                <dt>Organisation on this site</dt>
                <dd>
                  <Link href={`/organisations/${org.slug}`}>
                    {org.name} <ArrowUpRight size={13} aria-hidden="true" />
                  </Link>
                  <br />
                  {org.members} {org.members === 1 ? 'member' : 'members'} · since{' '}
                  {reviewDate(org.createdAt)}
                </dd>
              </div>
              <div>
                <dt>Sent by</dt>
                <dd>
                  {submittedBy.name}
                  <br />
                  {submittedBy.email}
                </dd>
              </div>
            </dl>
          </section>
          {v.status === 'PENDING' ? (
            <OrgDecisionForm
              key={v.updatedAt}
              id={v.id}
              version={v.updatedAt}
              registeredName={v.registeredName}
            />
          ) : (
            <section className="review-completed">
              <h2>
                {v.status === 'VERIFIED' ? `Verified as ${v.verifiedName}` : 'Not verified'}
              </h2>
              <p>
                Decided {reviewDate(v.decidedAt)}
                {v.reviewer ? ` by ${v.reviewer.name}` : ''}.
              </p>
              {v.reason && <blockquote>{v.reason}</blockquote>}
              <Link className="primary-button" href="/admin/organisation-checks">
                Review another check
              </Link>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
