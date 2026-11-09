import Link from 'next/link';
import { Landmark, ShieldCheck } from 'lucide-react';
import { ApiError, apiAs } from '../../_lib/api';
import { AddAccountForm } from '../_components/add-account-form';
import { manageBankAccount, requestNameReview } from '../money-actions';
import type { Bank, BankAccount } from '../_lib/types';

export const metadata = { title: 'Payout accounts' };

const date = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Lagos',
});

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; asked?: string }>;
}) {
  const returnTo = '/dashboard/payouts';
  const { error, asked } = await searchParams;
  let accounts: BankAccount[] = [];
  let banks: Bank[] = [];
  let unavailable = false;
  try {
    [accounts, banks] = await Promise.all([
      apiAs<BankAccount[]>('/bank-accounts', { returnTo }),
      apiAs<Bank[]>('/banks', { returnTo }),
    ]);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    unavailable = true;
  }
  const now = Date.now();

  return (
    <>
      <div className="dashboard-heading">
        <div>
          <div className="section-eyebrow">Payouts</div>
          <h1>Payout accounts</h1>
          <p className="dashboard-lede">
            Where your withdrawals are paid. Nigerian bank accounts, up to five.
          </p>
        </div>
      </div>
      {error && (
        <p className="dashboard-notice error" role="alert">
          {error}
        </p>
      )}
      {asked === '1' && !error && (
        <p className="dashboard-notice" role="status">
          Review requested. We’ll email you when an administrator decides.
        </p>
      )}
      {accounts.some((a) => a.nameCheck === 'UNVERIFIED') && (
        <p className="dashboard-notice" role="status">
          Withdrawals only go to accounts in your verified name.{' '}
          <Link href="/dashboard/verification">Verify your identity</Link> to
          withdraw.
        </p>
      )}
      {unavailable ? (
        <div className="dashboard-panel">
          <p className="field-hint">
            Payouts aren’t switched on for this site yet, so bank accounts can’t
            be added. Donations still collect in your campaign wallet.
          </p>
        </div>
      ) : (
        <div className="dashboard-columns">
          <div className="dashboard-main">
            <section className="dashboard-panel" aria-labelledby="accounts-title">
              <h2 id="accounts-title">Your accounts</h2>
              {accounts.length === 0 ? (
                <p className="field-hint">No payout accounts yet. Add one to withdraw.</p>
              ) : (
                <ul className="account-list">
                  {accounts.map((a) => {
                    const waiting = new Date(a.payoutsAvailableAt).getTime() > now;
                    return (
                      <li key={a.id}>
                        <Landmark size={22} strokeWidth={1.5} aria-hidden="true" />
                        <div className="account-details">
                          <strong>{a.accountName}</strong>
                          <span>
                            {a.bankName} {a.maskedAccountNumber}
                          </span>
                          {a.isDefault && <span className="status-pill status-active">Default</span>}
                          {waiting && (
                            <small>
                              Ready for payouts from{' '}
                              {date.format(new Date(a.payoutsAvailableAt))}
                            </small>
                          )}
                          {!a.recipientUsable && (
                            <small className="field-error">
                              This account can’t receive payouts. Remove it and add it again.
                            </small>
                          )}
                          <NameStanding account={a} />
                        </div>
                        <form action={manageBankAccount} className="account-actions">
                          <input type="hidden" name="id" value={a.id} />
                          {!a.isDefault && (
                            <button type="submit" name="op" value="default" className="text-button">
                              Make default
                            </button>
                          )}
                          <button
                            type="submit"
                            name="op"
                            value="remove"
                            className="text-button"
                            aria-label={`Remove ${a.bankName} ${a.maskedAccountNumber}`}
                          >
                            Remove
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
          <aside className="dashboard-side">
            <section className="dashboard-panel" aria-labelledby="add-title">
              <h2 id="add-title">Add an account</h2>
              {accounts.length >= 5 ? (
                <p className="field-hint">You have five accounts. Remove one to add another.</p>
              ) : (
                <AddAccountForm banks={banks} />
              )}
              <p className="field-hint privacy-line">
                <ShieldCheck size={13} aria-hidden="true" /> We check the account
                name with your bank and email you whenever an account is added.
              </p>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}

const day = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Africa/Lagos',
});

/**
 * Whether withdrawals can go to this account by name, and the way to ask an
 * administrator when the bank's name genuinely differs from the verified one.
 */
function NameStanding({ account: a }: { account: BankAccount }) {
  if (a.nameCheck === 'APPROVED')
    return (
      <small className="name-standing approved">
        <ShieldCheck size={13} aria-hidden="true" /> Approved for withdrawals by
        an administrator
      </small>
    );
  if (a.nameCheck !== 'MISMATCH') return null;
  const review = a.nameReview;
  if (review?.status === 'PENDING')
    return (
      <small className="name-standing">
        The name differs from your verified name. Review requested{' '}
        {day.format(new Date(review.createdAt))}; we’ll email you the decision.
      </small>
    );
  return (
    <div className="name-standing mismatch">
      <small>
        This name doesn’t match your verified name, so withdrawals can’t go
        here.
      </small>
      {review?.status === 'DECLINED' && review.reason && (
        <small>
          Not approved: <em>{review.reason}</em>
        </small>
      )}
      <details>
        <summary>
          {review?.status === 'DECLINED' ? 'Ask again' : 'Ask for a review'}
        </summary>
        <form action={requestNameReview}>
          <input type="hidden" name="id" value={a.id} />
          <label htmlFor={`why-${a.id}`}>Why are the names different?</label>
          <textarea
            id={`why-${a.id}`}
            name="explanation"
            required
            minLength={10}
            maxLength={500}
            rows={3}
            placeholder="For example: the account is in my married name; my ID still has my maiden name."
          />
          <button type="submit" className="secondary-button">
            Send for review
          </button>
        </form>
      </details>
    </div>
  );
}
