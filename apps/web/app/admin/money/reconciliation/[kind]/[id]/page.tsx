import { OperationForm } from '../../../../_components/operation-form';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiAs, ApiError } from '../../../../../_lib/api';
import { money, date, type RecordDetail } from '../../../types';
export const metadata = { title: 'Reconciliation record' };
export default async function Detail({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!['WITHDRAWAL', 'DONATION', 'EVENT'].includes(kind)) notFound();
  let d: RecordDetail;
  try {
    d = await apiAs<RecordDetail>(
      `/admin/money/reconciliation/${kind}/${encodeURIComponent(id)}`,
      { returnTo: `/admin/money/reconciliation/${kind}/${id}` },
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    if (e instanceof ApiError && e.status === 403)
      return <p>Administrator access needed.</p>;
    throw e;
  }
  const fields: [string, string | null | undefined][] = [
    ['Reference', d.reference],
    ['Checkout state', d.checkoutState],
    [
      'Reconciliation required',
      d.reconciliationRequired === undefined
        ? null
        : d.reconciliationRequired
          ? 'Yes'
          : 'No',
    ],
    ['Provider', d.provider],
    ['Provider checkout ID', d.providerCheckoutId],
    ['Provider payment ID', d.providerPaymentId],
    ['Provider payout ID', d.providerPayoutId],
    ['Event ID', d.eventId],
    ['Event type', d.type],
    ['Provider resource ID', d.resourceId],
    ['Created / received', date(d.createdAt ?? d.receivedAt)],
    ['Last updated', d.updatedAt ? date(d.updatedAt) : null],
    ['Occurred', d.occurredAt ? date(d.occurredAt) : null],
    ['Processed', kind === 'EVENT' ? date(d.processedAt) : null],
    ['Outcome reason', d.reason],
    ['Destination bank', d.bankName],
    ['Masked account', d.maskedAccountNumber],
  ];
  const values: [string, string | undefined | null][] =
    kind === 'DONATION'
      ? [
          ['Gift amount', d.amount],
          ['Total charged', d.totalCharged],
          ['Platform fee', d.platformFee],
          ['Donor processing fee', d.donorFee],
          ['Net to campaign', d.netToCampaign],
        ]
      : kind === 'WITHDRAWAL'
        ? [
            ['Gross withdrawal', d.amount],
            ['Withdrawal fee', d.fee],
            ['Net payout', d.netPaidOut],
          ]
        : [['Provider reported amount', d.amount]];
  return (
    <>
      <Link
        className="review-back"
        href={`/admin/money/reconciliation?kind=${kind}`}
      >
        ← Reconciliation queue
      </Link>
      <div className="review-title">
        <div>
          <div className="section-eyebrow">
            {kind === 'EVENT'
              ? 'Provider event'
              : kind === 'DONATION'
                ? 'Checkout record'
                : 'Withdrawal record'}
          </div>
          <h1>{d.campaign?.title ?? 'Provider event inspection'}</h1>
          <p className="money-reference">{d.reference ?? d.eventId ?? d.id}</p>
        </div>
        <span className="money-state is-warning">
          {d.status ?? d.outcome ?? 'UNPROCESSED'}
        </span>
      </div>
      <div className="money-detail-grid">
        <section>
          <h2>Record details</h2>
          <dl className="money-facts">
            {fields
              .filter(([, v]) => v != null)
              .map(([l, v]) => (
                <div key={l}>
                  <dt>{l}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
          {d.campaign && (
            <Link href={`/admin/campaigns/${d.campaign.id}`}>
              Inspect campaign context ↗
            </Link>
          )}
        </section>
        <aside>
          <section className="money-amount-panel">
            <h2>Amounts</h2>
            <dl>
              {values.map(([l, v]) => (
                <div key={l}>
                  <dt>{l}</dt>
                  <dd>{money(v, d.currency)}</dd>
                </div>
              ))}
            </dl>
            {kind === 'WITHDRAWAL' && (
              <p className="money-queue-note">
                {d.payoutsFrozen
                  ? 'New payouts are frozen for this campaign.'
                  : 'No campaign payout freeze is currently active.'}
                {d.payoutFreezeReason ? ` ${d.payoutFreezeReason}` : ''}
              </p>
            )}
          </section>
          <section className="money-linked">
            <h2>Ledger links</h2>
            {d.ledgerLinks.length ? (
              d.ledgerLinks.map((l) => (
                <Link key={l.id} href={`/admin/money/ledger/${l.id}`}>
                  {l.label} ↗
                </Link>
              ))
            ) : (
              <p>No linked ledger posting is recorded.</p>
            )}
            {d.relatedRecords?.map((r) => (
              <Link
                key={r.id}
                href={`/admin/money/reconciliation/${r.kind}/${r.id}`}
              >
                Inspect {r.kind.toLowerCase()} · {r.reference} ↗
              </Link>
            ))}
          </section>
        </aside>
      </div>
      {d.freezes && (
        <section className="review-history">
          <h2>Recent payout-freeze history</h2>
          {d.freezes.length ? (
            d.freezes.map((f) => (
              <article key={f.id}>
                <div>
                  <strong>
                    {f.frozen ? 'Payouts frozen' : 'Payout freeze lifted'}
                  </strong>
                  <time>{date(f.createdAt)}</time>
                </div>
                <small>By {f.actor.name}</small>
                <p>{f.reason}</p>
              </article>
            ))
          ) : (
            <p>No payout-freeze history is recorded.</p>
          )}
        </section>
      )}
      <OperationForm key={`${kind}-${d.updatedAt ?? d.processedAt ?? d.receivedAt}`} title={kind === 'EVENT' ? 'Reprocess stored event' : kind === 'DONATION' ? 'Verify payment with provider' : 'Payout reconciliation'} path={`money/reconciliation/${kind}/${id}/actions`} fixed={{ expectedUpdatedAt: d.updatedAt ?? d.processedAt ?? d.receivedAt }} fields={[{ name: 'action', label: 'Action', options: kind === 'EVENT' ? [{ value: 'REPROCESS', label: 'Reprocess this stored event' }] : kind === 'DONATION' ? [{ value: 'VERIFY', label: 'Verify payment and reconcile' }] : [{ value: 'VERIFY', label: 'Verify payout and reconcile' }, ...(['FAILED', 'REVERSED'].includes(d.status ?? '') ? [{ value: 'RETRY', label: 'Retry the returned payout' }] : [])] }]} description={kind === 'WITHDRAWAL' ? 'Verification checks the provider reference, destination, currency and exact amount. A retry creates one new payout attempt only after a confirmed return of funds, and honours the campaign freeze and bank-account checks.' : kind === 'DONATION' ? 'Only provider-confirmed successful payments can settle. The original fee snapshot is preserved.' : 'Run the original verified event through the settlement checks again. Successful postings cannot be duplicated.'} confirmation="I have checked this record and understand the action selected." submitLabel="Run action" />
    </>
  );
}
