import Link from 'next/link';
import { ArrowUpRight, Building2 } from 'lucide-react';
import { apiAs, ApiError } from '../../_lib/api';
import { REGISTRATION_LABEL } from '../../dashboard/organisations/types';
import { reviewDate } from '../types';
import type { OrgCheckQueue } from './types';

export const metadata = { title: 'Organisation checks' };

const TABS = [
  ['PENDING', 'Waiting'],
  ['VERIFIED', 'Verified'],
  ['REJECTED', 'Not verified'],
] as const;

export default async function OrganisationChecksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const p = await searchParams,
    status = TABS.some(([s]) => s === p.status) ? p.status! : 'PENDING',
    n = Number(p.page ?? 1),
    page = Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
  const query = new URLSearchParams({ status, page: String(page) });
  let data: OrgCheckQueue;
  try {
    data = await apiAs<OrgCheckQueue>(`/admin/organisation-checks?${query}`, {
      returnTo: `/admin/organisation-checks?${query}`,
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 403)
      return (
        <p>
          Administrator access needed.{' '}
          <Link href="/dashboard">Return to dashboard</Link>
        </p>
      );
    throw e;
  }
  const href = (n: number) => `?${new URLSearchParams({ status, page: String(n) })}`;
  return (
    <>
      <div className="review-title">
        <div>
          <div className="section-eyebrow">Who is raising the money</div>
          <h1>Organisation checks</h1>
          <p>
            Compare each registration certificate with the details entered.
            Verified organisations show a badge on their public profile.
          </p>
        </div>
        <div className="review-count">
          <Building2 size={20} aria-hidden="true" />
          <strong>{data.pending}</strong>
          <span>waiting for review</span>
        </div>
      </div>
      <div className="review-toolbar">
        <nav aria-label="Check status">
          {TABS.map(([s, label]) => (
            <Link
              key={s}
              href={`?${new URLSearchParams({ status: s })}`}
              aria-current={status === s ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="review-list-caption">
        <span>
          {data.total} {data.total === 1 ? 'check' : 'checks'}
        </span>
        <span>{status === 'PENDING' ? 'Oldest first' : 'Newest first'}</span>
      </div>
      {data.items.length ? (
        <div className="review-list">
          {data.items.map((v) => (
            <Link
              className="moderation-row"
              key={v.id}
              href={`/admin/organisation-checks/${v.id}`}
            >
              <div className="moderation-row-icon">
                <Building2 size={21} aria-hidden="true" />
              </div>
              <div>
                <span className="review-category">
                  {REGISTRATION_LABEL[v.registrationType]} {v.registrationNumber} ·{' '}
                  {reviewDate(v.decidedAt ?? v.createdAt)}
                </span>
                <h2>{v.registeredName}</h2>
                <p>Organisation: {v.organisation.name}</p>
                {v.status === 'REJECTED' && v.reason && <small>{v.reason}</small>}
              </div>
              <span className="review-open">
                {status === 'PENDING' ? 'Review' : 'View'}{' '}
                <ArrowUpRight size={17} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <section className="review-empty">
          <Building2 size={34} aria-hidden="true" />
          <h2>{status === 'PENDING' ? 'Nobody is waiting.' : 'Nothing here yet.'}</h2>
          <p>Registration certificates from organisations appear here.</p>
        </section>
      )}
      <nav className="review-pagination" aria-label="Check pages">
        {page > 1 && <Link href={href(page - 1)}>← Previous</Link>}
        <span>Page {page}</span>
        {page < 1000 && page * data.limit < data.total && (
          <Link href={href(page + 1)}>Next →</Link>
        )}
      </nav>
    </>
  );
}
