import Link from 'next/link';
import { ArrowUpRight, Landmark } from 'lucide-react';
import { apiAs, ApiError } from '../../_lib/api';
import { reviewDate } from '../types';
import type { NameReviewQueue } from './types';

export const metadata = { title: 'Payout names' };

const TABS = [
  ['PENDING', 'Waiting'],
  ['APPROVED', 'Approved'],
  ['DECLINED', 'Declined'],
  ['CANCELLED', 'Withdrawn'],
] as const;

export default async function PayoutNamesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const p = await searchParams,
    status = TABS.some(([s]) => s === p.status) ? p.status! : 'PENDING',
    n = Number(p.page ?? 1),
    page = Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
  const query = new URLSearchParams({ status, page: String(page) });
  let data: NameReviewQueue;
  try {
    data = await apiAs<NameReviewQueue>(`/admin/payout-names?${query}`, {
      returnTo: `/admin/payout-names?${query}`,
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
    `?${new URLSearchParams({ status, page: String(n) })}`;
  return (
    <>
      <div className="review-title">
        <div>
          <div className="section-eyebrow">Where the money goes</div>
          <h1>Payout names</h1>
          <p>
            Creators can only withdraw to accounts in their verified name. When
            a bank shows a different name, such as a married name, they explain
            why and you decide.
          </p>
        </div>
        <div className="review-count">
          <Landmark size={20} aria-hidden="true" />
          <strong>{data.pending}</strong>
          <span>waiting for review</span>
        </div>
      </div>
      <div className="review-toolbar">
        <nav aria-label="Review status">
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
          {data.total} {data.total === 1 ? 'request' : 'requests'}
        </span>
        <span>{status === 'PENDING' ? 'Oldest first' : 'Newest first'}</span>
      </div>
      {data.items.length ? (
        <div className="review-list">
          {data.items.map((r) => (
            <Link
              className="moderation-row"
              key={r.id}
              href={`/admin/payout-names/${r.id}`}
            >
              <div className="moderation-row-icon">
                <Landmark size={21} aria-hidden="true" />
              </div>
              <div>
                <span className="review-category">
                  {r.account} · {reviewDate(r.decidedAt ?? r.createdAt)}
                </span>
                <h2>
                  {r.accountName}{' '}
                  <span className="name-review-versus">
                    for {r.verifiedName}
                  </span>
                </h2>
                <p>
                  Account: {r.user.name} · {r.user.email}
                </p>
                {r.status === 'DECLINED' && r.reason && (
                  <small>{r.reason}</small>
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
          <Landmark size={34} aria-hidden="true" />
          <h2>{status === 'PENDING' ? 'Nobody is waiting.' : 'Nothing here yet.'}</h2>
          <p>Requests from creators whose bank shows another name appear here.</p>
        </section>
      )}
      <nav className="review-pagination" aria-label="Request pages">
        {page > 1 && <Link href={href(page - 1)}>← Previous</Link>}
        <span>Page {page}</span>
        {page < 1000 && page * data.limit < data.total && (
          <Link href={href(page + 1)}>Next →</Link>
        )}
      </nav>
    </>
  );
}
