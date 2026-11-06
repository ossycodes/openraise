import Link from 'next/link';
import { apiAs, ApiError } from '../../../_lib/api';
import { money, date, pageNumber, type QueuePage } from '../types';
export const metadata = { title: 'Reconciliation' };
export default async function Queue({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams,
    kind = ['WITHDRAWAL', 'DONATION', 'EVENT'].includes(p.kind ?? '')
      ? p.kind!
      : 'WITHDRAWAL',
    q = (p.q ?? '').trim().slice(0, 100),
    currency = ['NGN', 'USD', 'GHS', 'KES'].includes(p.currency ?? '')
      ? p.currency!
      : '',
    page = pageNumber(p.page);
  const query = new URLSearchParams({
    kind,
    page: String(page),
    ...(q ? { q } : {}),
    ...(currency ? { currency } : {}),
  });
  let data: QueuePage;
  try {
    data = await apiAs<QueuePage>(`/admin/money/reconciliation?${query}`, {
      returnTo: `/admin/money/reconciliation?${query}`,
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 403)
      return <p>Administrator access needed.</p>;
    throw e;
  }
  const href = (n: number) => {
    const v = new URLSearchParams(query);
    v.set('page', String(n));
    return `?${v}`;
  };
  return (
    <>
      <div className="review-title">
        <div>
          <div className="section-eyebrow">
            Investigate before taking the next step
          </div>
          <h1>Reconciliation</h1>
          <p>
            Uncertain outcomes and exceptions that need an operator’s attention.
          </p>
        </div>
      </div>
      <div className="review-toolbar">
        <nav aria-label="Reconciliation records">
          {[
            ['WITHDRAWAL', 'Withdrawals'],
            ['DONATION', 'Checkouts'],
            ['EVENT', 'Provider events'],
          ].map(([v, l]) => (
            <Link
              key={v}
              href={`?kind=${v}`}
              aria-current={kind === v ? 'page' : undefined}
            >
              {l}
            </Link>
          ))}
        </nav>
      </div>
      <form
        action="/admin/money/reconciliation"
        className="money-filters reconciliation-filters"
      >
        <input type="hidden" name="kind" value={kind} />
        <div>
          <label htmlFor="reconciliation-search">
            {kind === 'EVENT'
              ? 'Reference or event ID'
              : 'Reference or campaign title'}
          </label>
          <input
            id="reconciliation-search"
            name="q"
            defaultValue={q}
            maxLength={100}
          />
        </div>
        <div>
          <label htmlFor="reconciliation-currency">Currency</label>
          <select
            id="reconciliation-currency"
            name="currency"
            defaultValue={currency}
          >
            <option value="">All currencies</option>
            {['NGN', 'USD', 'GHS', 'KES'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <button className="primary-button" type="submit">
          Filter records
        </button>
      </form>
      <div className="money-queue-note">
        {kind === 'WITHDRAWAL'
          ? 'Flagged or uncertain payouts, initialization over one minute, and pending payouts unchanged for over 24 hours.'
          : kind === 'DONATION'
            ? 'Uncertain or stalled checkout creation, plus settled records missing a ledger link. Ordinary abandoned checkouts are excluded.'
            : 'Rejected or unmatched payment events, and events still unprocessed after one minute. Raw webhook payloads are never shown.'}
      </div>
      <div className="review-list-caption">
        <span>
          {data.total} {data.total === 1 ? 'record' : 'records'}
        </span>
        <span>Oldest first</span>
      </div>
      {data.items.length ? (
        <div className="money-queue-list">
          {data.items.map((r) => (
            <Link
              href={`/admin/money/reconciliation/${kind}/${r.id}`}
              className="money-queue-row"
              key={r.id}
            >
              <div>
                <span className="money-state is-warning">
                  {r.status.replaceAll('_', ' ')}
                </span>
                <h2>{r.campaign?.title ?? r.reference}</h2>
                <code>{r.reference}</code>
                <p>{r.reason.replaceAll('-', ' ')}</p>
              </div>
              <div>
                <strong>{money(r.amount, r.currency)}</strong>
                <span>
                  {r.provider} · {date(r.createdAt)}
                </span>
                <small>Inspect record ↗</small>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <section className="review-empty">
          <h2>No records need review here.</h2>
          <p>
            {q || currency
              ? 'Try removing a filter to inspect the full queue.'
              : 'New exceptions will appear when their review thresholds are met.'}
          </p>
          {(q || currency) && <Link href={`?kind=${kind}`}>Clear filters</Link>}
        </section>
      )}
      <nav className="review-pagination" aria-label="Reconciliation pages">
        {page > 1 && <Link href={href(page - 1)}>← Previous</Link>}
        <span>Page {page}</span>
        {page < 1000 && page * 20 < data.total && (
          <Link href={href(page + 1)}>Next →</Link>
        )}
      </nav>
    </>
  );
}
