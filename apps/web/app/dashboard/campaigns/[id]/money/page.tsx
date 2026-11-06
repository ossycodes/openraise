import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatMoney } from '@openraise/shared';
import { ArrowLeft, Download, Lock } from 'lucide-react';
import { ApiError, apiAs } from '../../../../_lib/api';
import { CampaignTabs } from '../../../_components/dashboard-nav';
import { WithdrawForm } from '../../../_components/withdraw-form';
import { IdentityCallout } from '../../../_components/identity-callout';
import { identity, myCampaigns } from '../../../_lib/data';
import {
  WITHDRAWAL_LABEL,
  type BankAccount,
  type MoneySummary,
  type ReceivedDonation,
  type Withdrawal,
} from '../../../_lib/types';

export const metadata = { title: 'Money' };

const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Lagos',
});

/** Bank accounts, or none when the deployment has payouts switched off. */
async function payoutAccounts(returnTo: string): Promise<BankAccount[]> {
  try {
    return await apiAs<BankAccount[]>('/bank-accounts', { returnTo });
  } catch (error) {
    if (error instanceof ApiError) return [];
    throw error;
  }
}

export default async function CampaignMoneyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const pageParam = Number((await searchParams).page ?? 1);
  const page =
    Number.isInteger(pageParam) && pageParam > 0
      ? Math.min(pageParam, 10_000)
      : 1;
  const returnTo = `/dashboard/campaigns/${id}/money`;
  const base = `/campaigns/${encodeURIComponent(id)}`;

  const campaign = (await myCampaigns(returnTo)).find((c) => c.id === id);
  if (!campaign) notFound();
  const [summary, withdrawals, donations, accounts, kyc] = await Promise.all([
    apiAs<MoneySummary>(`${base}/money`, { returnTo }),
    apiAs<{ items: Withdrawal[]; hasMore: boolean }>(
      `${base}/withdrawals?page=1`,
      { returnTo },
    ),
    apiAs<{ items: ReceivedDonation[]; hasMore: boolean }>(
      `${base}/donations/received?page=${page}`,
      { returnTo },
    ),
    payoutAccounts(returnTo),
    identity(returnTo),
  ]);
  const money = (minor: string) => formatMoney(BigInt(minor), summary.currency);
  const canWithdraw =
    summary.payoutsSupported &&
    !summary.payoutsFrozen &&
    BigInt(summary.available) > 0n;

  return (
    <>
      <Link href="/dashboard" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" /> Your campaigns
      </Link>
      <div className="dashboard-heading">
        <div>
          <div className="section-eyebrow">Money</div>
          <h1>{campaign.title}</h1>
        </div>
      </div>
      <CampaignTabs id={id} />

      <section className="money-stats" aria-label="Totals">
        <div className="money-stat feature">
          <span>Available to withdraw</span>
          <strong>{money(summary.available)}</strong>
        </div>
        <div className="money-stat">
          <span>Raised</span>
          <strong>{money(summary.raised)}</strong>
          <small>
            {summary.donationCount}{' '}
            {summary.donationCount === 1 ? 'donation' : 'donations'}
          </small>
        </div>
        <div className="money-stat">
          <span>Platform fees</span>
          <strong>{money(summary.platformFees)}</strong>
        </div>
        <div className="money-stat">
          <span>Withdrawals on their way</span>
          <strong>{money(summary.withdrawalsInProgress)}</strong>
        </div>
        <div className="money-stat">
          <span>Paid out to you</span>
          <strong>{money(summary.paidOut)}</strong>
        </div>
      </section>

      <div className="dashboard-columns">
        <div className="dashboard-main">
          <section
            className="dashboard-panel"
            aria-labelledby="donations-title"
          >
            <div className="panel-heading">
              <h2 id="donations-title">Donations</h2>
              {summary.donationCount > 0 && (
                <a
                  className="secondary-button compact"
                  href={`/api/dashboard/campaigns/${encodeURIComponent(id)}/donations/export`}
                  download
                >
                  <Download size={16} aria-hidden="true" /> Download CSV
                </a>
              )}
            </div>
            {donations.items.length === 0 ? (
              <p className="field-hint">
                No confirmed donations yet. They appear here once the payment
                provider confirms them.
              </p>
            ) : (
              <div
                className="table-wrap"
                role="region"
                aria-label="Donations"
                tabIndex={0}
              >
                <table className="money-table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Supporter</th>
                      <th scope="col">Donation</th>
                      <th scope="col">Platform fee</th>
                      <th scope="col">To your campaign</th>
                    </tr>
                  </thead>
                  <tbody>
                    {donations.items.map((d) => (
                      <tr key={d.id}>
                        <td>{dateTime.format(new Date(d.confirmedAt))}</td>
                        <td>
                          <strong>{d.donorName ?? 'Name not provided'}</strong>
                          <small className="donor-visibility">
                            {d.isAnonymous
                              ? 'Anonymous publicly'
                              : 'Name shared publicly'}
                          </small>
                          {d.donorMessage && (
                            <p className="supporter-message">
                              {d.donorMessage}
                            </p>
                          )}
                        </td>
                        <td>{money(d.amount)}</td>
                        <td>
                          {d.donorCoveredPlatformFee
                            ? 'Covered by donor'
                            : money(d.platformFee)}
                        </td>
                        <td>{money(d.netToCampaign)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(page > 1 || donations.hasMore) && (
              <nav className="pager" aria-label="Donation pages">
                {page > 1 && <Link href={`?page=${page - 1}`}>Newer</Link>}
                <span>Page {page}</span>
                {donations.hasMore && (
                  <Link href={`?page=${page + 1}`}>Older</Link>
                )}
              </nav>
            )}
            <p className="field-hint privacy-line">
              <Lock size={13} aria-hidden="true" /> Donors’ email addresses stay
              private. You see amounts and dates.
            </p>
          </section>

          <section
            className="dashboard-panel"
            aria-labelledby="withdrawals-title"
          >
            <h2 id="withdrawals-title">Withdrawals</h2>
            {withdrawals.items.length === 0 ? (
              <p className="field-hint">No withdrawals yet.</p>
            ) : (
              <ul className="withdrawal-list">
                {withdrawals.items.map((w) => (
                  <li key={w.id}>
                    <div>
                      <strong>{money(w.netPaidOut)}</strong>
                      <small>
                        {w.bankName} {w.maskedAccountNumber} ·{' '}
                        {dateTime.format(new Date(w.createdAt))}
                      </small>
                      {/* `reason` is an internal code; the status label says what happened. */}
                      {w.reconciliationRequired && (
                        <small>We’re confirming this one with the bank.</small>
                      )}
                    </div>
                    <span
                      className={`status-pill withdrawal-${w.status.toLowerCase()}`}
                    >
                      {WITHDRAWAL_LABEL[w.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="dashboard-side">
          <section className="dashboard-panel" aria-labelledby="withdraw-title">
            <h2 id="withdraw-title">Withdraw</h2>
            {!summary.payoutsSupported ? (
              <p className="field-hint">
                {summary.currency === 'NGN'
                  ? 'Payouts aren’t switched on for this site yet.'
                  : 'Withdrawals are available for NGN campaigns to Nigerian bank accounts for now.'}
              </p>
            ) : summary.payoutsFrozen ? (
              <div className="review-note">
                <Lock size={18} aria-hidden="true" />
                <div>
                  <strong>Withdrawals are paused</strong>
                  <p>
                    {summary.payoutFreezeReason ??
                      'Contact support to find out more.'}
                  </p>
                </div>
              </div>
            ) : !canWithdraw ? (
              <p className="field-hint">Nothing to withdraw yet.</p>
            ) : kyc.status !== 'VERIFIED' ? (
              <IdentityCallout status={kyc.status} purpose="withdraw" />
            ) : (
              <WithdrawForm
                campaignId={id}
                currency={summary.currency}
                available={summary.available}
                accounts={accounts}
              />
            )}
            <p className="field-hint withdraw-fee-note">
              Each withdrawal has a {money(summary.withdrawalFee)} fee, taken
              from the amount you withdraw.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
