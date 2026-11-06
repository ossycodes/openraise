'use server';

import { isCurrency, toMinorUnits } from '@openraise/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { ApiError, apiAs } from '../_lib/api';

export interface WithdrawState {
  step: 'amount' | 'confirm' | 'done';
  message?: string;
  amountInput?: string;
  bankAccountId?: string;
  quote?: { amount: string; fee: string; netPaidOut: string; currency: string };
  /** Reused for the confirm step, so a double submit can't pay out twice */
  key?: string;
}

/**
 * The two-step withdrawal: "review" asks the API for the fee breakdown, then
 * "confirm" requests the payout with the reviewed fee and one idempotency key.
 */
export async function withdraw(prev: WithdrawState, form: FormData): Promise<WithdrawState> {
  const id = String(form.get('campaignId') ?? '');
  const intent = String(form.get('intent') ?? 'review');
  const returnTo = `/dashboard/campaigns/${id}/money`;
  const path = `/campaigns/${encodeURIComponent(id)}/withdrawals`;

  if (intent === 'edit')
    return { step: 'amount', amountInput: prev.amountInput, bankAccountId: prev.bankAccountId };

  if (intent === 'confirm' && prev.step === 'confirm' && prev.quote && prev.key) {
    try {
      await apiAs(path, {
        method: 'POST',
        body: {
          amount: prev.quote.amount,
          bankAccountId: prev.bankAccountId,
          expectedFee: prev.quote.fee,
        },
        headers: { 'Idempotency-Key': prev.key },
        returnTo,
      });
    } catch (error) {
      if (error instanceof ApiError) return { ...prev, message: friendlyWithdrawalError(error) };
      throw error;
    }
    revalidatePath(returnTo);
    return { step: 'done', message: 'Withdrawal requested.' };
  }

  const amountInput = String(form.get('amount') ?? '');
  const bankAccountId = String(form.get('bankAccountId') ?? '');
  const currency = String(form.get('currency') ?? 'NGN');
  const back = (message: string): WithdrawState => ({
    step: 'amount',
    message,
    amountInput,
    bankAccountId,
  });
  if (!bankAccountId) return back('Choose the bank account to pay into.');
  let amount: bigint;
  try {
    amount = toMinorUnits(amountInput, isCurrency(currency) ? currency : 'NGN');
    if (amount <= 0n) throw new RangeError();
  } catch {
    return back('Enter the amount to withdraw, like 50000');
  }
  try {
    const quote = await apiAs<{
      amount: string;
      fee: string;
      netPaidOut: string;
      currency: string;
      availableBalance: string;
    }>(`${path}/quote`, { method: 'POST', body: { amount: amount.toString() }, returnTo });
    if (BigInt(quote.availableBalance) < amount)
      return back('That’s more than is available to withdraw.');
    return {
      step: 'confirm',
      amountInput,
      bankAccountId,
      quote: {
        amount: quote.amount,
        fee: quote.fee,
        netPaidOut: quote.netPaidOut,
        currency: quote.currency,
      },
      key: randomUUID(),
    };
  } catch (error) {
    if (error instanceof ApiError) return back(friendlyWithdrawalError(error));
    throw error;
  }
}

function friendlyWithdrawalError(error: ApiError): string {
  if (error.status === 503) return 'Payouts aren’t available on this site right now.';
  return error.message;
}

export interface AccountState {
  step: 'details' | 'confirm' | 'done';
  message?: string;
  bankCode?: string;
  accountNumber?: string;
  resolved?: { bankName: string; accountName: string; maskedAccountNumber: string };
}

/** Add a payout account: look the name up first, then save it on confirm. */
export async function addBankAccount(prev: AccountState, form: FormData): Promise<AccountState> {
  const intent = String(form.get('intent') ?? 'lookup');
  const returnTo = '/dashboard/payouts';
  if (intent === 'edit')
    return { step: 'details', bankCode: prev.bankCode, accountNumber: prev.accountNumber };
  if (intent === 'confirm' && prev.step === 'confirm') {
    try {
      await apiAs('/bank-accounts', {
        method: 'POST',
        body: { bankCode: prev.bankCode, accountNumber: prev.accountNumber },
        returnTo,
      });
    } catch (error) {
      if (error instanceof ApiError) return { ...prev, message: error.message };
      throw error;
    }
    revalidatePath(returnTo);
    return { step: 'done', message: 'Account added.' };
  }

  const bankCode = String(form.get('bankCode') ?? '');
  const accountNumber = String(form.get('accountNumber') ?? '').replace(/\s/g, '');
  const back = (message: string): AccountState => ({
    step: 'details',
    message,
    bankCode,
    accountNumber,
  });
  if (!bankCode) return back('Choose your bank.');
  if (!/^\d{10}$/.test(accountNumber)) return back('Enter the 10-digit account number.');
  try {
    const resolved = await apiAs<NonNullable<AccountState['resolved']>>(
      '/bank-accounts/resolve',
      { method: 'POST', body: { bankCode, accountNumber }, returnTo },
    );
    return { step: 'confirm', bankCode, accountNumber, resolved };
  } catch (error) {
    if (error instanceof ApiError)
      return back(
        error.status === 400
          ? 'We couldn’t find that account. Check the bank and number.'
          : error.message,
      );
    throw error;
  }
}

/** Make an account the default, or remove it. Refusals come back as ?error=. */
export async function manageBankAccount(form: FormData): Promise<void> {
  const id = encodeURIComponent(String(form.get('id') ?? ''));
  const op = String(form.get('op') ?? '');
  const returnTo = '/dashboard/payouts';
  try {
    if (op === 'default')
      await apiAs(`/bank-accounts/${id}/default`, { method: 'PUT', returnTo });
    else if (op === 'remove') await apiAs(`/bank-accounts/${id}`, { method: 'DELETE', returnTo });
  } catch (error) {
    if (error instanceof ApiError)
      redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
  revalidatePath(returnTo);
}
