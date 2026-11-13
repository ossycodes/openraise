import Link from 'next/link';
import { ClipboardCheck, ArrowUpRight, Search, Clock3 } from 'lucide-react';
import { formatMoney } from '@openraise/shared';
import { apiAs, ApiError } from '../../_lib/api';
import { reviewDate, type ReviewQueue } from '../types';
export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const status = ['PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'PAUSED', 'ENDED'].includes(
    params.status ?? '',
  )
    ? params.status!
    : 'PENDING_REVIEW';
  const q = (params.q ?? '').trim().slice(0, 100);
  const requested = Number(params.page ?? 1);
  const page =
    Number.isInteger(requested) && requested >= 1 && requested <= 1000
      ? requested
      : 1;
  const query = new URLSearchParams({ status, q, page: String(page) });
  let data: ReviewQueue;
  try {
    data = await apiAs<ReviewQueue>(`/admin/campaigns?${query}`, {
      returnTo: `/admin/campaigns?${query}`,
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 403)
      return (
        <div className="review-empty">
          <h1>Administrator access needed</h1>
          <Link href="/dashboard">Return to dashboard</Link>
        </div>
      );
    throw e;
  }
  const href = (p: number) =>
    `?${new URLSearchParams({ status, q, page: String(p) })}`;
  return (
    <>
      <div className="review-title">
        <div>
          <div className="section-eyebrow">Trust starts with a closer look</div>
          <h1>Campaign review</h1>
          <p>
            Real stories. Thoughtful decisions. Help good causes take their next
            step.
          </p>
        </div>
        <div className="review-count">
          <Clock3 size={21} aria-hidden="true" />
          <strong>{data.pending}</strong>
          <span>awaiting review</span>
        </div>
      </div>
      <div className="review-toolbar">
        <nav aria-label="Review status">
          {[
            ['PENDING_REVIEW', 'Awaiting review'],
            ['ACTIVE', 'Live'],
            ['REJECTED', 'Returned'],
            ['PAUSED', 'Paused'],
            ['ENDED', 'Ended'],
          ].map(([value, label]) => (
            <Link
              key={value}
              href={`?${new URLSearchParams({ status: value, q })}`}
              aria-current={status === value ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <form action="/admin/campaigns" className="review-search">
          <input type="hidden" name="status" value={status} />
          <label className="sr-only" htmlFor="review-search">
            Search campaigns or organisers
          </label>
          <Search size={17} aria-hidden="true" />
          <input
            id="review-search"
            name="q"
            defaultValue={q}
            placeholder="Campaign or organiser"
            maxLength={100}
          />
          <button type="submit">Search</button>
        </form>
      </div>
      <div className="review-list-caption">
        <span>
          {data.total} {data.total === 1 ? 'campaign' : 'campaigns'}
          {q ? ` matching “${q}”` : ''}
        </span>
        <span>Oldest submissions first</span>
      </div>
      {data.items.length ? (
        <div className="review-list">
          {data.items.map((c) => (
            <Link
              key={c.id}
              className="review-row"
              href={`/admin/campaigns/${c.id}`}
            >
              <div className="review-row-photo">
                {c.coverImageUrl ? (
                  <img src={c.coverImageUrl} alt="" loading="lazy" />
                ) : (
                  <ClipboardCheck size={28} aria-hidden="true" />
                )}
              </div>
              <div className="review-row-story">
                <span className="review-category">
                  {c.category.name} <span>·</span>{' '}
                  {c.location ?? 'Location not provided'}
                </span>
                <h2>{c.title}</h2>
                <p>By {c.owner.name}</p>
              </div>
              <div className="review-row-meta">
                <strong>{formatMoney(BigInt(c.goalAmount), c.currency)}</strong>
                <span>Goal · {reviewDate(c.submittedAt)}</span>
              </div>
              <span className="review-open">
                Review <ArrowUpRight size={17} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <section className="review-empty">
          <ClipboardCheck size={36} strokeWidth={1.3} aria-hidden="true" />
          <h2>
            {q
              ? 'No matching campaigns.'
              : status === 'PENDING_REVIEW'
                ? 'You’re all caught up.'
                : 'Nothing here yet.'}
          </h2>
          <p>
            {q
              ? 'Try another title or organiser name.'
              : 'Submitted campaigns will appear here for a closer look.'}
          </p>
          {q && <Link href={`?status=${status}`}>Clear search</Link>}
        </section>
      )}
      <nav className="review-pagination" aria-label="Review queue pages">
        {page > 1 && <Link href={href(page - 1)}>← Previous</Link>}
        <span>Page {page}</span>
        {page * data.limit < data.total && (
          <Link href={href(page + 1)}>Next →</Link>
        )}
      </nav>
      <p className="review-footnote">
        <ShieldNote /> Publishing review checks the campaign content. It does
        not establish identity verification.
      </p>
    </>
  );
}
function ShieldNote() {
  return <ClipboardCheck size={15} aria-hidden="true" />;
}
