'use client';

import Link from 'next/link';
import { formatMoney, type Currency } from '@openraise/shared';
import { decimalInput } from '../../_lib/campaign';
import { withdraw, type WithdrawState } from '../money-actions';
import type { BankAccount } from '../_lib/types';
import { useFormAction } from './use-form-action';

/** Withdraw to a payout account: enter an amount, review the fee, confirm. */
export function WithdrawForm({
  campaignId,
  currency,
  available,
  accounts,
}: {
  campaignId: string;
  currency: Currency;
  available: string;
  accounts: BankAccount[];
}) {
  const {
    state,
    run: action,
    pending,
    version,
  } = useFormAction<WithdrawState>(withdraw, { step: 'amount' });
  const money = (minor: string) => formatMoney(BigInt(minor), currency);
  const now = Date.now();
  const usable = accounts.filter((a) => a.recipientUsable);
  const account = accounts.find((a) => a.id === state.bankAccountId);

  if (usable.length === 0)
    return (
      <p className="field-hint">
        Add the bank account you want to be paid into first.{' '}
        <Link href="/dashboard/payouts">Add a payout account</Link>
      </p>
    );

  if (state.step === 'done')
    return (
      <div className="withdraw-done" role="status">
        <p>
          <strong>Withdrawal requested.</strong> It shows below as it moves
          through the bank. Most arrive the same day.
        </p>
        <form action={action}>
          <input type="hidden" name="campaignId" value={campaignId} />
          <button type="submit" name="intent" value="edit" className="text-button">
            Make another withdrawal
          </button>
        </form>
      </div>
    );

  if (state.step === 'confirm' && state.quote)
    return (
      <form action={action} className="withdraw-review">
        <input type="hidden" name="campaignId" value={campaignId} />
        <dl>
          <div>
            <dt>Withdrawing</dt>
            <dd>{money(state.quote.amount)}</dd>
          </div>
          <div>
            <dt>Withdrawal fee</dt>
            <dd>− {money(state.quote.fee)}</dd>
          </div>
          <div className="withdraw-total">
            <dt>You receive</dt>
            <dd>{money(state.quote.netPaidOut)}</dd>
          </div>
          {account && (
            <div>
              <dt>Paid into</dt>
              <dd>
                {account.bankName} {account.maskedAccountNumber}
                <br />
                <small>{account.accountName}</small>
              </dd>
            </div>
          )}
        </dl>
        {state.message && (
          <p className="field-error" role="alert">
            {state.message}
          </p>
        )}
        <div className="form-actions">
          <button
            type="submit"
            name="intent"
            value="confirm"
            className="primary-button"
            disabled={pending}
          >
            {pending ? 'Requesting…' : `Withdraw ${money(state.quote.netPaidOut)}`}
          </button>
          <button
            type="submit"
            name="intent"
            value="edit"
            className="text-button"
            disabled={pending}
          >
            Change amount
          </button>
        </div>
      </form>
    );

  const defaultAccount = state.bankAccountId ?? (usable.find((a) => a.isDefault) ?? usable[0]).id;
  return (
    <form action={action} className="withdraw-form" noValidate key={version}>
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="currency" value={currency} />
      <div className="form-row">
        <div className="form-field">
          <label htmlFor="withdraw-amount">Amount</label>
          <input
            id="withdraw-amount"
            name="amount"
            inputMode="decimal"
            defaultValue={state.amountInput ?? ''}
            placeholder={decimalInput(available)}
            aria-describedby="withdraw-hint"
          />
          <p className="field-hint" id="withdraw-hint">
            Up to {money(available)}.
          </p>
        </div>
        <div className="form-field">
          <label htmlFor="withdraw-account">Pay into</label>
          <select id="withdraw-account" name="bankAccountId" defaultValue={defaultAccount}>
            {usable.map((a) => {
              const waiting = new Date(a.payoutsAvailableAt).getTime() > now;
              return (
                <option key={a.id} value={a.id}>
                  {a.bankName} {a.maskedAccountNumber}
                  {waiting ? ' (ready in 24 hours)' : ''}
                </option>
              );
            })}
          </select>
        </div>
      </div>
      {state.message && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" name="intent" value="review" className="primary-button" disabled={pending}>
          {pending ? 'Checking…' : 'Review withdrawal'}
        </button>
      </div>
    </form>
  );
}
