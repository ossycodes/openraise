import Link from 'next/link';
import { ArrowUpRight, IdCard, Search } from 'lucide-react';
import { apiAs, ApiError } from '../../_lib/api';
import { DOCUMENT_LABEL } from '../../dashboard/_lib/types';
import { reviewDate } from '../types';
import type { VerificationQueue } from './types';

export const metadata = { title: 'Identity checks' };

const TABS = [
  ['PENDING', 'Waiting'],
  ['VERIFIED', 'Verified'],
  ['REJECTED', 'Not verified'],
] as const;

export default async function VerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const p = await searchParams,
    status = TABS.some(([s]) => s === p.status) ? p.status! : 'PENDING',
    q = (p.q ?? '').trim().slice(0, 100),
    n = Number(p.page ?? 1),
    page = Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
  const query = new URLSearchParams({ status, q, page: String(page) });
  let data: VerificationQueue;
  try {
    data = await apiAs<VerificationQueue>(`/admin/kyc?${query}`, {
      returnTo: `/admin/verifications?${query}`,
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
  const href = (n: number) =>
    `?${new URLSearchParams({ status, q, page: String(n) })}`;
  return (
    <>
      <div className="review-title">
        <div>
          <div className="section-eyebrow">Who is raising the money</div>
          <h1>Identity checks</h1>
          <p>
            Compare each ID photo with the details entered. Campaigns can’t go
            live and money can’t be withdrawn until a person is verified.
          </p>
        </div>
        <div className="review-count">
          <IdCard size={20} aria-hidden="true" />
          <strong>{data.pending}</strong>
          <span>waiting for review</span>
        </div>
      </div>
      <div className="review-toolbar">
        <nav aria-label="Check status">
          {TABS.map(([s, label]) => (
            <Link
              key={s}
              href={`?${new URLSearchParams({ status: s, q })}`}
              aria-current={status === s ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <form action="/admin/verifications" className="review-search">
          <input type="hidden" name="status" value={status} />
          <Search size={17} aria-hidden="true" />
          <label className="sr-only" htmlFor="verification-search">
            Search names and emails
          </label>
          <input
            id="verification-search"
            name="q"
            placeholder="Search names and emails"
            defaultValue={q}
            maxLength={100}
          />
          <button type="submit">Search</button>
        </form>
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
              href={`/admin/verifications/${v.id}`}
            >
              <div className="moderation-row-icon">
                <IdCard size={21} aria-hidden="true" />
              </div>
              <div>
                <span className="review-category">
                  {DOCUMENT_LABEL[v.documentType]} ·{' '}
                  {reviewDate(v.decidedAt ?? v.createdAt)}
                </span>
                <h2>{v.legalName}</h2>
                <p>
                  Account: {v.user.name} · {v.user.email}
                </p>
                {v.status === 'VERIFIED' && v.verifiedName && (
                  <small>Verified as {v.verifiedName}</small>
                )}
                {v.status === 'REJECTED' && v.reason && (
                  <small>{v.reason}</small>
                )}
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
          <IdCard size={34} aria-hidden="true" />
          <h2>
            {q
              ? 'No matching checks.'
              : status === 'PENDING'
                ? 'Nobody is waiting.'
                : 'Nothing here yet.'}
          </h2>
          <p>
            {q
              ? 'Try another name or email.'
              : 'Identity checks from creators appear here.'}
          </p>
          {q && <Link href={`?status=${status}`}>Clear search</Link>}
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
