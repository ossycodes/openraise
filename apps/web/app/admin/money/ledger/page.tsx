import Link from 'next/link';
import { apiAs, ApiError } from '../../../_lib/api';
import { KIND_LABEL, money, date, pageNumber, type LedgerPage } from '../types';
export const metadata = { title: 'Ledger' };
export default async function LedgerPageView({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams,
    page = pageNumber(p.page),
    q = (p.q ?? '').trim().slice(0, 100),
    currency = ['NGN', 'USD', 'GHS', 'KES'].includes(p.currency ?? '')
      ? p.currency!
      : '',
    kind = Object.hasOwn(KIND_LABEL, p.kind ?? '') ? p.kind! : '',
    campaignId = (p.campaignId ?? '').trim().slice(0, 100);
  const params = new URLSearchParams({
    page: String(page),
    ...(q ? { q } : {}),
    ...(currency ? { currency } : {}),
    ...(kind ? { kind } : {}),
    ...(campaignId ? { campaignId } : {}),
  });
  let data: LedgerPage;
  try {
    data = await apiAs<LedgerPage>(`/admin/money/ledger?${params}`, {
      returnTo: `/admin/money/ledger?${params}`,
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 403)
      return <p>Administrator access needed.</p>;
    throw e;
  }
  const href = (n: number) => {
    const v = new URLSearchParams(params);
    v.set('page', String(n));
    return `?${v}`;
  };
  return (
    <>
      <div className="review-title">
        <div>
          <div className="section-eyebrow">The permanent record</div>
          <h1>Ledger</h1>
          <p>Inspect balanced postings and follow the event behind each one.</p>
        </div>
      </div>
      <form action="/admin/money/ledger" className="money-filters">
        <div>
          <label htmlFor="ledger-search">
            Reference, transaction or description
          </label>
          <input
            id="ledger-search"
            name="q"
            defaultValue={q}
            maxLength={100}
            placeholder="Search the ledger"
          />
        </div>
        <div>
          <label htmlFor="ledger-currency">Currency</label>
          <select id="ledger-currency" name="currency" defaultValue={currency}>
            <option value="">All currencies</option>
            {['NGN', 'USD', 'GHS', 'KES'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ledger-kind">Posting type</label>
          <select id="ledger-kind" name="kind" defaultValue={kind}>
            <option value="">All posting types</option>
            {Object.entries(KIND_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <button className="primary-button" type="submit">
          Filter ledger
        </button>
        <details className="money-advanced">
          <summary>Filter by campaign ID</summary>
          <label htmlFor="ledger-campaign">Campaign ID</label>
          <input
            id="ledger-campaign"
            name="campaignId"
            defaultValue={campaignId}
            maxLength={100}
          />
        </details>
      </form>
      {data.campaignWallet && (
        <section className="money-integrity">
          <div>
            <strong>
              {data.campaignWallet.campaign.title} · Wallet balance
            </strong>
            <p>
              {data.campaignWallet.balances
                .map((b) => money(b.balance, b.currency))
                .join(' · ')}
            </p>
            <p>
              Derived from wallet postings after reservations. Withdrawal
              eligibility checks still apply.
            </p>
          </div>
        </section>
      )}
      <div className="review-list-caption">
        <span>
          {data.total} {data.total === 1 ? 'posting' : 'postings'}
        </span>
        <span>Newest first · debit and credit totals</span>
      </div>
      {data.items.length ? (
        <div className="money-ledger-list">
          <div className="money-ledger-head" aria-hidden="true">
            <span>Posting</span>
            <span>Debits</span>
            <span>Credits</span>
          </div>
          {data.items.map((r) => (
            <Link
              className="money-ledger-row"
              href={`/admin/money/ledger/${r.id}`}
              key={r.id}
            >
              <div>
                <span className="review-category">
                  {KIND_LABEL[r.kind]} · {date(r.createdAt)}
                </span>
                <h2>{r.description}</h2>
                <small>
                  {r.id} · {r.entryCount} entries
                </small>
              </div>
              <div>
                <span className="money-mobile-label">Debits</span>
                <strong>{money(r.debits, r.currency)}</strong>
              </div>
              <div>
                <span className="money-mobile-label">Credits</span>
                <strong>{money(r.credits, r.currency)}</strong>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <section className="review-empty">
          <h2>No matching postings.</h2>
          <p>Try another reference or remove a filter.</p>
          <Link href="/admin/money/ledger">Clear filters</Link>
        </section>
      )}
      <nav className="review-pagination" aria-label="Ledger pages">
        {page > 1 && <Link href={href(page - 1)}>← Previous</Link>}
        <span>Page {page}</span>
        {page < 1000 && page * 20 < data.total && (
          <Link href={href(page + 1)}>Next →</Link>
        )}
      </nav>
    </>
  );
}
