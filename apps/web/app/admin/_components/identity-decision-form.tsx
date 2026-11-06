'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Verify or decline one identity check. */
export function IdentityDecisionForm({
  id,
  version,
  legalName,
}: {
  id: string;
  version: string;
  legalName: string;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [verifiedName, setVerifiedName] = useState(legalName);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/verifications/${id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          decision === 'APPROVE'
            ? {
                decision,
                verifiedName: verifiedName.trim(),
                expectedUpdatedAt: version,
              }
            : { decision, reason: reason.trim(), expectedUpdatedAt: version },
        ),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          data.errors?.[0]?.message ??
            (typeof data.message === 'string'
              ? data.message
              : 'Check the decision and try again.'),
        );
      router.replace(`/admin/verifications/${id}?recorded=1`);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'The decision could not be confirmed. Reload before retrying.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="review-decision-form" onSubmit={(e) => void submit(e)}>
      <div className="section-eyebrow">Your decision</div>
      <h2>Is this the person on the ID?</h2>
      <fieldset disabled={busy}>
        <legend className="sr-only">Decision</legend>
        <label
          className={`review-choice ${decision === 'APPROVE' ? 'selected' : ''}`}
        >
          <input
            type="radio"
            name="decision"
            checked={decision === 'APPROVE'}
            onChange={() => setDecision('APPROVE')}
          />
          <span>
            <strong>Verify</strong>
            <small>The photo is clear and matches what they entered.</small>
          </span>
        </label>
        <label
          className={`review-choice ${decision === 'REJECT' ? 'selected' : ''}`}
        >
          <input
            type="radio"
            name="decision"
            checked={decision === 'REJECT'}
            onChange={() => setDecision('REJECT')}
          />
          <span>
            <strong>Decline</strong>
            <small>The photo is unclear, or the details don’t match.</small>
          </span>
        </label>
        {decision === 'APPROVE' ? (
          <div className="review-reason">
            <label htmlFor="verified-name">Name exactly as on the ID</label>
            <input
              id="verified-name"
              value={verifiedName}
              onChange={(e) => setVerifiedName(e.target.value)}
              required
              minLength={3}
              maxLength={100}
            />
            <small>
              Payout accounts must match this name, so correct the spelling or
              order if the ID differs.
            </small>
          </div>
        ) : (
          <div className="review-reason">
            <label htmlFor="decline-reason">What should they fix?</label>
            <textarea
              id="decline-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={5}
              maxLength={500}
              rows={4}
              placeholder="For example: the photo is blurred, so the name can’t be read."
            />
            <small>
              The creator sees this and can send their details again. The photo
              is deleted.
            </small>
          </div>
        )}
        <label className="review-confirm">
          <input key={decision} type="checkbox" required />
          <span>I’ve compared the photo with every detail entered.</span>
        </label>
      </fieldset>
      {error && (
        <div role="alert" className="review-decision-error">
          <p>{error}</p>
          <button type="button" onClick={() => location.reload()}>
            Reload latest status
          </button>
        </div>
      )}
      <button className="primary-button" type="submit" disabled={busy}>
        {busy
          ? 'Recording decision…'
          : decision === 'APPROVE'
            ? 'Verify identity'
            : 'Decline'}
      </button>
    </form>
  );
}
