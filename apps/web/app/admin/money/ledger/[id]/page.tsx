import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiAs, ApiError } from '../../../../_lib/api';
import {
  ACCOUNT_LABEL,
  KIND_LABEL,
  money,
  date,
  type Transaction,
} from '../../types';
export const metadata = { title: 'Ledger posting' };
export default async function Posting({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let d: Transaction;
  try {
    d = await apiAs<Transaction>(
      `/admin/money/ledger/${encodeURIComponent(id)}`,
      { returnTo: `/admin/money/ledger/${id}` },
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    if (e instanceof ApiError && e.status === 403)
      return <p>Administrator access needed.</p>;
    throw e;
  }
  const records = [
    ...(d.donation ? [{ ...d.donation, kind: 'DONATION' }] : []),
    ...[d.withdrawalHold, d.withdrawalSettlement, d.withdrawalReversal].flatMap(
      (w) => (w ? [{ ...w, kind: 'WITHDRAWAL' }] : []),
    ),
  ];
  return (
    <>
      <Link className="review-back" href="/admin/money/ledger">
        ← Ledger
      </Link>
      <div className="review-title">
        <div>
          <div className="section-eyebrow">
            {KIND_LABEL[d.kind]} · {d.currency}
          </div>
          <h1>Posting detail</h1>
          <p>{d.description}</p>
        </div>
        <span className={`money-state ${d.balanced ? '' : 'is-warning'}`}>
          {d.balanced ? 'Balanced' : 'Integrity review needed'}
        </span>
      </div>
      <dl className="money-record-meta">
        <div>
          <dt>Transaction</dt>
          <dd>{d.id}</dd>
        </div>
        <div>
          <dt>Posted</dt>
          <dd>{date(d.createdAt)}</dd>
        </div>
        <div>
          <dt>Signed entry sum</dt>
          <dd>{money(d.sum, d.currency)}</dd>
        </div>
      </dl>
      <section className="money-entry-list">
        <h2>Double-entry postings</h2>
        <p className="money-explainer">
          Positive amounts are debits; negative amounts are credits. A valid
          posting has at least two entries and a zero signed sum.
        </p>
        {d.entries.length ? (
          d.entries.map((e) => (
            <article key={e.id}>
              <div>
                <strong>
                  {ACCOUNT_LABEL[e.account.type] ?? e.account.type}
                </strong>
                <small>{e.account.id}</small>
                {e.account.campaign && (
                  <Link
                    href={`/admin/money/ledger?campaignId=${e.account.campaign.id}`}
                  >
                    {e.account.campaign.title}
                  </Link>
                )}
              </div>
              <div>
                <span>{BigInt(e.amount) > 0n ? 'Debit' : 'Credit'}</span>
                <strong>
                  {money(
                    BigInt(e.amount) < 0n
                      ? (-BigInt(e.amount)).toString()
                      : e.amount,
                    e.account.currency,
                  )}
                </strong>
              </div>
            </article>
          ))
        ) : (
          <div className="review-empty">No entries exist for this posting.</div>
        )}
      </section>
      <section className="money-linked">
        <h2>Related money records</h2>
        {records.length ? (
          records.map((r, i) => (
            <Link
              key={`${r.id}:${i}`}
              href={`/admin/money/reconciliation/${r.kind}/${r.id}`}
            >
              {r.kind === 'DONATION' ? 'Donation' : 'Withdrawal'} ·{' '}
              {r.reference} ↗
            </Link>
          ))
        ) : (
          <p>
            No linked donation or withdrawal. Inspect the posting description
            and account entries.
          </p>
        )}
      </section>
    </>
  );
}
