import Link from 'next/link';
import { ArrowUpRight, BookOpenCheck, ShieldCheck } from 'lucide-react';
import { apiAs, ApiError } from '../../_lib/api';
import { ACCOUNT_LABEL, money, date, type Summary } from './types';
export default async function MoneyPage() {
  let data: Summary | null = null;
  try {
    data = await apiAs<Summary>('/admin/money/summary', {
      returnTo: '/admin/money',
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 403)
      return (
        <p>
          Administrator access needed.{' '}
          <Link href="/dashboard">Return to dashboard</Link>
        </p>
      );
    if (!(e instanceof ApiError)) throw e;
  }
  const currencies = [...new Set(data?.balances.map((b) => b.currency) ?? [])];
  return (
    <>
      <div className="review-title money-heading">
        <div>
          <div className="section-eyebrow">Every posting tells a story</div>
          <h1>Money operations</h1>
          <p>
            Follow the ledger. Investigate the exceptions. Keep the next step
            considered.
          </p>
        </div>
        <BookOpenCheck size={36} strokeWidth={1.3} aria-hidden="true" />
      </div>
      {data ? (
        <>
          <div className="money-metrics">
            <Link href="/admin/money/ledger">
              <span>Posted transactions</span>
              <strong>{data.transactionCount}</strong>
              <small>
                Inspect the ledger <ArrowUpRight size={14} aria-hidden="true" />
              </small>
            </Link>
            {[
              ['withdrawals', 'Withdrawals to review', 'WITHDRAWAL'],
              ['donations', 'Checkouts to review', 'DONATION'],
              ['events', 'Provider events to review', 'EVENT'],
            ].map(([key, label, kind]) => (
              <Link key={key} href={`/admin/money/reconciliation?kind=${kind}`}>
                <span>{label}</span>
                <strong>{data.review[key as keyof Summary['review']]}</strong>
                <small>
                  Open queue <ArrowUpRight size={14} aria-hidden="true" />
                </small>
              </Link>
            ))}
          </div>
          <div
            className={`money-integrity ${data.unbalancedCount ? 'needs-attention' : ''}`}
          >
            <ShieldCheck size={19} aria-hidden="true" />
            <div>
              <strong>
                {data.unbalancedCount
                  ? `${data.unbalancedCount} ${data.unbalancedCount === 1 ? 'posting needs' : 'postings need'} an integrity review`
                  : 'Ledger posting checks are balanced'}
              </strong>
              <p>
                Checks entry count, zero-sum postings and matching account
                currencies. As of {date(data.asOf)}.
              </p>
            </div>
          </div>
          <section className="money-balances">
            <div className="money-section-heading">
              <div>
                <div className="section-eyebrow">
                  From committed ledger entries
                </div>
                <h2>Account balances</h2>
              </div>
              <Link href="/admin/money/ledger">View postings ↗</Link>
            </div>
            <p className="money-explainer">
              Balances follow each account’s normal debit/credit direction. They
              are not a bank statement, and currencies are kept separate.
            </p>
            {currencies.length ? (
              <div className="money-currency-grid">
                {currencies.map((c) => (
                  <article key={c}>
                    <h3>{c}</h3>
                    <dl>
                      {Object.entries(ACCOUNT_LABEL).map(([type, label]) => (
                        <div key={type}>
                          <dt>{label}</dt>
                          <dd>
                            {money(
                              data!.balances.find(
                                (b) => b.currency === c && b.type === type,
                              )?.balance ?? '0',
                              c,
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <div className="review-empty">
                <h3>No posted balances yet.</h3>
                <p>
                  Committed postings will appear here as donations and
                  withdrawals settle.
                </p>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="money-summary-error" role="alert">
          <h2>The overview totals are unavailable.</h2>
          <p>
            You can still open the ledger or reconciliation queue to inspect
            individual records.
          </p>
          <Link className="secondary-button" href="/admin/money/ledger">
            Open ledger
          </Link>
          <Link href="/admin/money/reconciliation">Open reconciliation</Link>
        </section>
      )}
      <p className="money-footnote">
        A queue can contain both a payment and a related provider event. Counts
        describe records, not unique incidents.
      </p>
    </>
  );
}
