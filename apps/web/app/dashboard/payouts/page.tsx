import { Landmark, ShieldCheck } from 'lucide-react';
import { ApiError, apiAs } from '../../_lib/api';
import { AddAccountForm } from '../_components/add-account-form';
import { manageBankAccount } from '../money-actions';
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
  searchParams: Promise<{ error?: string }>;
}) {
  const returnTo = '/dashboard/payouts';
  const { error } = await searchParams;
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
