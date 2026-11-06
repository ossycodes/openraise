import Link from 'next/link';
import {
  Wallet,
  ArrowUpRight,
  Clock3,
  RotateCcw,
  ReceiptText,
} from 'lucide-react';
import { formatMoney } from '@openraise/shared';
import type { MoneyTrail as Trail } from '../_lib/campaign';
export function MoneyTrail({
  trail,
  updatesPage = 1,
}: {
  trail: Trail | null;
  updatesPage?: number;
}) {
  const href = (page: number) =>
    `?${new URLSearchParams({ moneyPage: String(page), ...(updatesPage > 1 ? { updatesPage: String(updatesPage) } : {}) })}#money-trail`;
  if (!trail)
    return (
      <section id="money-trail" className="public-money-trail">
        <div className="section-eyebrow">Giving, clearly accounted for</div>
        <h2>The money trail</h2>
        <div className="trail-unavailable">
          <ReceiptText size={26} aria-hidden="true" />
          <h3>The money trail couldn’t load.</h3>
          <p>
            The campaign story is still available. Try again for its latest
            financial records.
          </p>
          <Link href={href(1)}>Reload money trail</Link>
        </div>
      </section>
    );
  const cash = (amount: string) => formatMoney(BigInt(amount), trail.currency);
  const date = (value: string) =>
    new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeZone: 'Africa/Lagos',
    }).format(new Date(value));
  const time = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Lagos',
  }).format(new Date(trail.asOf));
  return (
    <section id="money-trail" className="public-money-trail">
      <div className="section-eyebrow">Giving, clearly accounted for</div>
      <h2>The money trail</h2>
      <p className="trail-intro">
        See what’s been raised, what’s gone out and what remains in the campaign
        wallet.
      </p>
      <div className="trail-overview">
        <div>
          <span>Confirmed donations</span>
          <strong>{cash(trail.raised)}</strong>
          <small>
            {trail.donationCount} confirmed{' '}
            {trail.donationCount === 1 ? 'gift' : 'gifts'}
          </small>
        </div>
        <div>
          <span>Paid to the organiser</span>
          <strong>{cash(trail.paidOut)}</strong>
          <small>Completed payouts, after withdrawal fees</small>
        </div>
      </div>
      <div className="trail-wallet">
        <Wallet size={24} strokeWidth={1.5} aria-hidden="true" />
        <div>
          <span>Campaign wallet balance</span>
          <strong>{cash(trail.walletBalance)}</strong>
          <small>
            After withdrawal reservations. Payout eligibility checks still
            apply.
          </small>
        </div>
      </div>
      <details className="trail-breakdown">
        <summary>
          <ReceiptText size={16} aria-hidden="true" />
          How the totals add up
        </summary>
        <dl>
          <div>
            <dt>Confirmed donations</dt>
            <dd>{cash(trail.raised)}</dd>
          </div>
          <div>
            <dt>Platform fees deducted from gifts</dt>
            <dd>− {cash(trail.platformFeesDeducted)}</dd>
          </div>
          {BigInt(trail.otherWalletChanges) !== 0n && (
            <div>
              <dt>Other recorded wallet changes</dt>
              <dd>
                {BigInt(trail.otherWalletChanges) > 0n ? '+ ' : ''}
                {cash(trail.otherWalletChanges)}
              </dd>
            </div>
          )}
          <div>
            <dt>Completed payouts</dt>
            <dd>− {cash(trail.paidOut)}</dd>
          </div>
          <div>
            <dt>Fees on completed withdrawals</dt>
            <dd>− {cash(trail.withdrawalFeesPaid)}</dd>
          </div>
          <div>
            <dt>Reserved for withdrawals in progress</dt>
            <dd>− {cash(trail.reserved)}</dd>
          </div>
          <div className="trail-balance-line">
            <dt>Campaign wallet balance</dt>
            <dd>{cash(trail.walletBalance)}</dd>
          </div>
        </dl>
        <p>
          Platform fees covered separately by donors (
          {cash(trail.donorCoveredPlatformFees)}) aren’t deducted from gifts.
          Donor processing charges are also separate from the campaign’s raised
          amount.
        </p>
        {BigInt(trail.returned) > 0n && (
          <p>
            {cash(trail.returned)} in withdrawal reservations has been returned
            to the wallet. Those returns are already included in the balance
            above.
          </p>
        )}
      </details>
      <div className="trail-history-heading">
        <h3>Withdrawal history</h3>
        <span>
          {trail.withdrawals.total}{' '}
          {trail.withdrawals.total === 1 ? 'record' : 'records'}
        </span>
      </div>
      {trail.withdrawals.items.length ? (
        <ol className="trail-withdrawals">
          {trail.withdrawals.items.map((w) => (
            <li key={w.id}>
              <div className={`trail-event-icon ${w.state.toLowerCase()}`}>
                {w.state === 'PAID' ? (
                  <ArrowUpRight size={19} aria-hidden="true" />
                ) : w.state === 'RETURNED' ? (
                  <RotateCcw size={18} aria-hidden="true" />
                ) : (
                  <Clock3 size={18} aria-hidden="true" />
                )}
              </div>
              <div className="trail-event-copy">
                <strong>
                  {w.state === 'PAID'
                    ? 'Paid to organiser'
                    : w.state === 'RETURNED'
                      ? 'Returned to wallet'
                      : 'Withdrawal in progress'}
                </strong>
                <time dateTime={w.recordedAt}>{date(w.recordedAt)}</time>
                <p>
                  {w.state === 'PAID'
                    ? `${cash(w.amount)} withdrawn, including a ${cash(w.fee)} fee.`
                    : w.state === 'RETURNED'
                      ? 'The full reservation was returned. No withdrawal fee is retained.'
                      : 'This amount is reserved. A completed payout is not yet recorded.'}
                </p>
              </div>
              <span className="trail-event-amount">
                {cash(w.state === 'PAID' ? w.netPaidOut : w.amount)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="trail-history-empty">
          <Wallet size={26} strokeWidth={1.3} aria-hidden="true" />
          <h4>
            {trail.withdrawals.page > 1
              ? 'No withdrawals on this page.'
              : 'No withdrawals recorded yet.'}
          </h4>
          <p>Ledger-backed withdrawal activity will appear here.</p>
        </div>
      )}
      {(trail.withdrawals.page > 1 || trail.withdrawals.hasMore) && (
        <nav className="pager" aria-label="Withdrawal history pages">
          {trail.withdrawals.page > 1 && (
            <Link href={href(trail.withdrawals.page - 1)}>
              Newer withdrawals
            </Link>
          )}
          {trail.withdrawals.hasMore && trail.withdrawals.page < 1000 && (
            <Link href={href(trail.withdrawals.page + 1)}>
              Older withdrawals
            </Link>
          )}
        </nav>
      )}
      <p className="trail-source-note">
        From committed ledger records · Updated {time} (Lagos time). This
        records money movements, not how funds were spent. Bank and account
        details stay private.
      </p>
    </section>
  );
}
