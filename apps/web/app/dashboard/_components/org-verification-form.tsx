'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  REGISTRATION_LABEL,
  type OrgVerification,
} from '../organisations/types';

const FIELDS = ['registrationType', 'registrationNumber', 'registeredName', 'file'];

/** Sends an organisation's registration details and certificate photo. */
export function OrgVerificationForm({
  organisationId,
  previous,
}: {
  organisationId: string;
  previous: OrgVerification | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    setErrors({});
    try {
      const response = await fetch(
        `/api/dashboard/organisations/${encodeURIComponent(organisationId)}/verification`,
        { method: 'POST', body: new FormData(event.currentTarget) },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const found: Record<string, string> = {};
        for (const e of Array.isArray(data.errors) ? data.errors : []) {
          const key = e.path === 'documentKey' ? 'file' : e.path;
          if (FIELDS.includes(key)) found[key] ??= e.message;
        }
        setErrors(found);
        setMessage(
          Object.keys(found).length
            ? 'Check the highlighted details.'
            : (data.message ?? 'That didn’t go through. Try again.'),
        );
        return;
      }
      router.refresh();
    } catch {
      setMessage('That didn’t go through. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const invalid = (name: string) =>
    errors[name] ? { 'aria-invalid': true, 'aria-describedby': `${name}-error` } : {};
  const error = (name: string) =>
    errors[name] ? (
      <p className="field-error" id={`${name}-error`}>
        {errors[name]}
      </p>
    ) : null;

  return (
    <form className="campaign-form org-form" onSubmit={(e) => void submit(e)} noValidate>
      <fieldset disabled={busy} className="org-form org-fieldset">
        <legend className="sr-only">Registration details</legend>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="registrationType">Registered as</label>
            <select
              id="registrationType"
              name="registrationType"
              defaultValue={previous?.registrationType ?? 'INCORPORATED_TRUSTEES'}
              {...invalid('registrationType')}
            >
              {Object.entries(REGISTRATION_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {error('registrationType')}
          </div>
          <div className="form-field">
            <label htmlFor="registrationNumber">Registration number</label>
            <input
              id="registrationNumber"
              name="registrationNumber"
              defaultValue={previous?.registrationNumber}
              maxLength={20}
              required
              autoComplete="off"
              placeholder="IT 123456"
              {...invalid('registrationNumber')}
            />
            {error('registrationNumber')}
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="registeredName">Name on the certificate</label>
          <input
            id="registeredName"
            name="registeredName"
            defaultValue={previous?.registeredName}
            maxLength={150}
            required
            {...invalid('registeredName')}
          />
          {error('registeredName')}
        </div>
        <div className="form-field">
          <label htmlFor="file">Photo of the certificate</label>
          <input
            id="file"
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            aria-describedby="file-hint"
            {...invalid('file')}
          />
          {error('file') ?? (
            <p className="field-hint" id="file-hint">
              The whole certificate of registration, in good light, every corner
              showing. JPEG, PNG or WebP, up to 5 MB.
            </p>
          )}
        </div>
      </fieldset>
      {message && (
        <p className="dashboard-notice error" role="alert">
          {message}
        </p>
      )}
      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send for review'}
        </button>
      </div>
    </form>
  );
}
