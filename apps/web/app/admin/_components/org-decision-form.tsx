'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Verify or decline one organisation check. */
export function OrgDecisionForm({
  id,
  version,
  registeredName,
}: {
  id: string;
  version: string;
  registeredName: string;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [verifiedName, setVerifiedName] = useState(registeredName);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/organisation-checks/${id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          decision === 'APPROVE'
            ? { decision, verifiedName: verifiedName.trim(), expectedUpdatedAt: version }
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
      router.replace(`/admin/organisation-checks/${id}?recorded=1`);
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
      <h2>Is this organisation registered as stated?</h2>
      <fieldset disabled={busy}>
        <legend className="sr-only">Decision</legend>
        <label className={`review-choice ${decision === 'APPROVE' ? 'selected' : ''}`}>
          <input
            type="radio"
            name="decision"
            checked={decision === 'APPROVE'}
            onChange={() => setDecision('APPROVE')}
          />
          <span>
            <strong>Verify</strong>
            <small>The certificate is clear and matches the register.</small>
          </span>
        </label>
        <label className={`review-choice ${decision === 'REJECT' ? 'selected' : ''}`}>
          <input
            type="radio"
            name="decision"
            checked={decision === 'REJECT'}
            onChange={() => setDecision('REJECT')}
          />
          <span>
            <strong>Decline</strong>
            <small>It’s unclear, or the details don’t match the register.</small>
          </span>
        </label>
        {decision === 'APPROVE' ? (
          <div className="review-reason">
            <label htmlFor="verified-name">Registered name, exactly as on the certificate</label>
            <input
              id="verified-name"
              value={verifiedName}
              onChange={(e) => setVerifiedName(e.target.value)}
              required
              minLength={2}
              maxLength={150}
            />
            <small>
              Shown on the public profile, and what the organisation’s payout
              account must match later.
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
              placeholder="For example: the number isn’t on the CAC register."
            />
            <small>
              Owners and admins see this and can send the details again. The
              photo is deleted.
            </small>
          </div>
        )}
        <label className="review-confirm">
          <input key={decision} type="checkbox" required />
          <span>I’ve compared the certificate with the details and the register.</span>
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
        {busy ? 'Recording decision…' : decision === 'APPROVE' ? 'Verify organisation' : 'Decline'}
      </button>
    </form>
  );
}
