'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  DOCUMENT_LABEL,
  type DocumentType,
  type IdentityVerification,
} from '../_lib/types';

const FIELDS = [
  'documentType',
  'idNumber',
  'legalName',
  'dateOfBirth',
  'file',
  'selfie',
  'consent',
];

/** Sends ID details, plus a photo of the ID or a selfie, for checking. */
export function VerificationForm({
  documentRequired,
  selfieRequired,
  privacyPolicyUrl,
  previous,
}: {
  documentRequired: boolean;
  selfieRequired: boolean;
  privacyPolicyUrl: string | null;
  previous: IdentityVerification | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [type, setType] = useState<DocumentType>(
    previous &&
      (documentRequired || ['NIN_SLIP', 'BVN'].includes(previous.documentType))
      ? previous.documentType
      : 'NIN_SLIP',
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    setErrors({});
    try {
      const response = await fetch('/api/dashboard/verification', {
        method: 'POST',
        body: new FormData(event.currentTarget),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const found: Record<string, string> = {};
        for (const e of Array.isArray(data.errors) ? data.errors : []) {
          const key =
            e.path === 'documentKey'
              ? 'file'
              : e.path === 'selfieKey'
                ? 'selfie'
                : e.path;
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
      setMessage(
        'That didn’t go through. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const invalid = (name: string) =>
    errors[name]
      ? { 'aria-invalid': true, 'aria-describedby': `${name}-error` }
      : {};
  const error = (name: string) =>
    errors[name] ? (
      <p className="field-error" id={`${name}-error`}>
        {errors[name]}
      </p>
    ) : null;

  return (
    <form
      className="campaign-form verification-form"
      onSubmit={(e) => void submit(e)}
      noValidate
    >
      <fieldset disabled={busy}>
        <legend className="sr-only">Identity details</legend>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="documentType">ID document</label>
            <select
              id="documentType"
              name="documentType"
              value={type}
              onChange={(e) => setType(e.target.value as DocumentType)}
              {...invalid('documentType')}
            >
              {Object.entries(DOCUMENT_LABEL)
                .filter(
                  ([value]) =>
                    documentRequired || ['NIN_SLIP', 'BVN'].includes(value),
                )
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
            {error('documentType')}
          </div>
          <div className="form-field">
            <label htmlFor="idNumber">
              {type === 'NIN_SLIP'
                ? 'NIN'
                : type === 'BVN'
                  ? 'BVN'
                  : 'Document number'}
            </label>
            <input
              id="idNumber"
              name="idNumber"
              inputMode={
                type === 'NIN_SLIP' || type === 'BVN' ? 'numeric' : 'text'
              }
              autoComplete="off"
              maxLength={24}
              required
              aria-describedby="idNumber-hint"
              {...invalid('idNumber')}
            />
            {error('idNumber') ?? (
              <p className="field-hint" id="idNumber-hint">
                {type === 'NIN_SLIP' || type === 'BVN'
                  ? '11 digits.'
                  : 'As printed on the document.'}
              </p>
            )}
          </div>
        </div>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="legalName">Full name on the document</label>
            <input
              id="legalName"
              name="legalName"
              autoComplete="name"
              defaultValue={previous?.legalName}
              maxLength={100}
              required
              {...invalid('legalName')}
            />
            {error('legalName')}
          </div>
          <div className="form-field">
            <label htmlFor="dateOfBirth">Date of birth</label>
            <input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              autoComplete="bday"
              defaultValue={previous?.dateOfBirth}
              required
              {...invalid('dateOfBirth')}
            />
            {error('dateOfBirth')}
          </div>
        </div>
        {documentRequired && (
          <div className="form-field">
            <label htmlFor="file">Photo of the document</label>
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
                The page with your photo and name, in good light with every
                corner showing. JPEG, PNG or WebP, up to 5 MB.
              </p>
            )}
          </div>
        )}
        {selfieRequired && (
          <div className="form-field">
            <label htmlFor="selfie">Selfie</label>
            <input
              id="selfie"
              name="selfie"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="user"
              required
              aria-describedby="selfie-hint"
              {...invalid('selfie')}
            />
            {error('selfie') ?? (
              <p className="field-hint" id="selfie-hint">
                A clear photo of your face, in good light, so we can match it to
                your ID. JPEG, PNG or WebP, up to 5 MB.
              </p>
            )}
          </div>
        )}
        {!documentRequired && (
          <div className="form-field">
            <label htmlFor="consent" className="verification-consent">
              <input
                id="consent"
                name="consent"
                type="checkbox"
                value="yes"
                required
                {...invalid('consent')}
              />
              I agree to share my identity details
              {selfieRequired ? ' and selfie' : ''} with the identity
              verification provider to check my identity.
            </label>
            {privacyPolicyUrl && (
              <p className="field-hint">
                <a href={privacyPolicyUrl} target="_blank" rel="noreferrer">
                  Read the privacy notice
                </a>{' '}
                before agreeing.
              </p>
            )}
            {error('consent')}
          </div>
        )}
      </fieldset>
      {message && (
        <p className="dashboard-notice error" role="alert">
          {message}
        </p>
      )}
      <button className="primary-button" type="submit" disabled={busy}>
        {busy
          ? 'Sending…'
          : documentRequired
            ? 'Send for review'
            : 'Verify my identity'}
      </button>
    </form>
  );
}
