import Link from 'next/link';
import { Flag, Search, ArrowUpRight } from 'lucide-react';
import { apiAs, ApiError } from '../../_lib/api';
import { reviewDate } from '../types';
import { REPORT_CATEGORY, type ReportQueue } from './types';
export const metadata = { title: 'Reports & moderation' };
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const p = await searchParams,
    status = ['OPEN', 'RESOLVED', 'DISMISSED'].includes(p.status ?? '')
      ? p.status!
      : 'OPEN',
    q = (p.q ?? '').trim().slice(0, 100),
    n = Number(p.page ?? 1),
    page = Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
  const query = new URLSearchParams({ status, q, page: String(page) });
  let data: ReportQueue;
  try {
    data = await apiAs<ReportQueue>(`/admin/reports?${query}`, {
      returnTo: `/admin/reports?${query}`,
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
          <div className="section-eyebrow">
            A closer look, a considered response
          </div>
          <h1>Reports & moderation</h1>
          <p>
            Review concerns privately. Record what you found and what happens
            next.
          </p>
        </div>
        <div className="review-count">
          <Flag size={20} aria-hidden="true" />
          <strong>{data.open}</strong>
          <span>open reports</span>
        </div>
      </div>
      <div className="review-toolbar">
        <nav aria-label="Report status">
          {['OPEN', 'RESOLVED', 'DISMISSED'].map((s) => (
            <Link
              key={s}
              href={`?${new URLSearchParams({ status: s, q })}`}
              aria-current={status === s ? 'page' : undefined}
            >
              {s[0] + s.slice(1).toLowerCase()}
            </Link>
          ))}
        </nav>
        <form action="/admin/reports" className="review-search">
          <input type="hidden" name="status" value={status} />
          <Search size={17} aria-hidden="true" />
          <label className="sr-only" htmlFor="report-search">
            Search campaign titles
          </label>
          <input
            id="report-search"
            name="q"
            placeholder="Search campaign titles"
            defaultValue={q}
            maxLength={100}
          />
          <button type="submit">Search</button>
        </form>
      </div>
      <div className="review-list-caption">
        <span>
          {data.total} {data.total === 1 ? 'report' : 'reports'}
        </span>
        <span>Oldest first</span>
      </div>
      {data.items.length ? (
        <div className="review-list">
          {data.items.map((r) => (
            <Link
              className="moderation-row"
              key={r.id}
              href={`/admin/reports/${r.id}`}
            >
              <div className="moderation-row-icon">
                <Flag size={21} aria-hidden="true" />
              </div>
              <div>
                <span className="review-category">
                  {REPORT_CATEGORY[r.category]} · {reviewDate(r.createdAt)}
                </span>
                <h2>{r.campaign.title}</h2>
                <p>
                  {r.details}
                  {r.details.length === 160 ? '…' : ''}
                </p>
                <small>Organised by {r.campaign.owner.name}</small>
              </div>
              <span className="review-open">
                Inspect <ArrowUpRight size={17} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <section className="review-empty">
          <Flag size={34} aria-hidden="true" />
          <h2>
            {q
              ? 'No matching reports.'
              : status === 'OPEN'
                ? 'No open reports.'
                : 'No reports here yet.'}
          </h2>
          <p>
            {q
              ? 'Try a different campaign title.'
              : 'Reports from campaign visitors will appear here for review.'}
          </p>
          {q && <Link href={`?status=${status}`}>Clear search</Link>}
        </section>
      )}
      <nav className="review-pagination" aria-label="Report pages">
        {page > 1 && <Link href={href(page - 1)}>← Previous</Link>}
        <span>Page {page}</span>
        {page < 1000 && page * 20 < data.total && (
          <Link href={href(page + 1)}>Next →</Link>
        )}
      </nav>
      <p className="review-footnote">
        Reports describe allegations. A report alone does not establish
        misconduct.
      </p>
    </>
  );
}
