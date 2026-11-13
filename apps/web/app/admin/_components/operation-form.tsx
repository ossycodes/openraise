'use client';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toMinorUnits, type Currency } from '@openraise/shared';
export interface OperationField {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'email' | 'url' | 'number';
  value?: string | number;
  options?: { value: string; label: string }[];
  nullable?: boolean;
  required?: boolean;
  currency?: Currency;
  percent?: boolean;
}
export function OperationForm({
  path,
  title,
  description,
  fields = [],
  fixed = {},
  settings = false,
  confirmation,
  submitLabel = 'Save changes',
}: {
  path: string;
  title: string;
  description?: string;
  fields?: OperationField[];
  fixed?: Record<string, unknown>;
  settings?: boolean;
  confirmation?: string;
  submitLabel?: string;
}) {
  const id = useId(),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [retryId, setRetryId] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const values: Record<string, unknown> = {};
      for (const field of fields) {
        const value = String(form.get(field.name) ?? '').trim();
        values[field.name] =
          field.nullable && !value
            ? null
            : field.currency
              ? toMinorUnits(value, field.currency).toString()
              : field.percent
                ? Number(toMinorUnits(value, 'NGN'))
                : field.type === 'number'
                  ? Number(value)
                  : value;
      }
      const reason = String(form.get('reason') ?? '').trim();
      const body = settings
        ? { ...fixed, values, reason }
        : { ...fixed, ...values, reason };
      const response = await fetch(`/api/admin/operations/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          Array.isArray(result.errors) && result.errors.length
            ? result.errors
                .map(
                  (e: { path: string; message: string }) =>
                    `${e.path}: ${e.message}`,
                )
                .join(' · ')
            : (result.message ??
                'The change could not be confirmed. Reload before trying again.'),
        );
      if (result.retryId) setRetryId(result.retryId);
      setSuccess('Change recorded.');
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'The change could not be confirmed. Reload before trying again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={`admin-operation-form${settings ? ' admin-settings-form' : ''}`}
      onSubmit={(event) => void submit(event)}
    >
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      <fieldset disabled={busy || !!success}>
        <legend className="sr-only">{title}</legend>
        {fields.map((field) => (
          <div className="form-field" key={field.name}>
            <label htmlFor={`${id}-${field.name}`}>{field.label}</label>
            {field.options ? (
              <select
                id={`${id}-${field.name}`}
                name={field.name}
                defaultValue={field.value}
                required
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                id={`${id}-${field.name}`}
                name={field.name}
                defaultValue={field.value}
                maxLength={200}
              />
            ) : (
              <input
                id={`${id}-${field.name}`}
                name={field.name}
                type={field.type ?? 'text'}
                defaultValue={field.value}
                required={field.required ?? !field.nullable}
                step={field.type === 'number' ? 1 : undefined}
                min={field.type === 'number' ? 0 : undefined}
                inputMode={
                  field.currency || field.percent ? 'decimal' : undefined
                }
              />
            )}
          </div>
        ))}
        <div className="form-field admin-operation-reason">
          <label htmlFor={`${id}-reason`}>Reason for this change</label>
          <textarea
            id={`${id}-reason`}
            name="reason"
            minLength={5}
            maxLength={500}
            required
          />
        </div>
        {confirmation && (
          <label className="admin-operation-confirm">
            <input type="checkbox" required />
            {confirmation}
          </label>
        )}
        <button className="primary-button" type="submit">
          {busy ? 'Saving…' : submitLabel}
        </button>
      </fieldset>
      {error && (
        <p className="dashboard-notice error" role="alert">
          {error}
        </p>
      )}
      {success && <p role="status">{success}</p>}
      {retryId && (
        <Link
          href={`/admin/money/reconciliation/WITHDRAWAL/${encodeURIComponent(retryId)}`}
        >
          Inspect the new payout attempt →
        </Link>
      )}
    </form>
  );
}
