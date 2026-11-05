'use client';

import { addBankAccount, type AccountState } from '../money-actions';
import type { Bank } from '../_lib/types';
import { useFormAction } from './use-form-action';

/** Add a payout account: pick the bank, enter the number, confirm the name. */
export function AddAccountForm({ banks }: { banks: Bank[] }) {
  const {
    state,
    run: action,
    pending,
    version,
  } = useFormAction<AccountState>(addBankAccount, { step: 'details' });

  if (state.step === 'confirm' && state.resolved)
    return (
      <form action={action} className="account-confirm">
        <p className="field-hint">Is this the right account?</p>
        <div className="account-card">
          <strong>{state.resolved.accountName}</strong>
          <span>
            {state.resolved.bankName} {state.resolved.maskedAccountNumber}
          </span>
        </div>
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
            {pending ? 'Adding…' : 'Yes, add this account'}
          </button>
          <button type="submit" name="intent" value="edit" className="text-button" disabled={pending}>
            Change details
          </button>
        </div>
      </form>
    );

  return (
    <form action={action} className="campaign-form" noValidate key={version}>
      {state.step === 'done' && (
        <p className="dashboard-notice" role="status">
          Account added. For your safety, it can receive payouts 24 hours from now.
        </p>
      )}
      <div className="form-row">
        <div className="form-field">
          <label htmlFor="bankCode">Bank</label>
          <select id="bankCode" name="bankCode" defaultValue={state.bankCode ?? ''}>
            <option value="">Choose your bank</option>
            {banks.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="accountNumber">Account number</label>
          <input
            id="accountNumber"
            name="accountNumber"
            inputMode="numeric"
            autoComplete="off"
            maxLength={10}
            defaultValue={state.step === 'done' ? '' : (state.accountNumber ?? '')}
            placeholder="0123456789"
          />
        </div>
      </div>
      {state.message && state.step !== 'done' && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" name="intent" value="lookup" className="primary-button" disabled={pending}>
          {pending ? 'Looking up…' : 'Find account'}
        </button>
      </div>
    </form>
  );
}
