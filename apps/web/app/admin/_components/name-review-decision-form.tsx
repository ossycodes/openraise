'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Approve or decline withdrawals to one account in another name. */
export function NameReviewDecisionForm({
  id,
  version,
  canApprove,
}: {
  id: string;
  version: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<'APPROVE' | 'DECLINE'>(
    canApprove ? 'APPROVE' : 'DECLINE',
  );
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/payout-names/${id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          decision === 'APPROVE'
            ? { decision, expectedUpdatedAt: version }
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
      router.replace(`/admin/payout-names/${id}?recorded=1`);
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
      <h2>Can money go to this account?</h2>
      <fieldset disabled={busy}>
        <legend className="sr-only">Decision</legend>
        <label
          className={`review-choice ${decision === 'APPROVE' ? 'selected' : ''}`}
        >
          <input
            type="radio"
            name="decision"
            checked={decision === 'APPROVE'}
            disabled={!canApprove}
            onChange={() => setDecision('APPROVE')}
          />
          <span>
            <strong>Approve</strong>
            <small>
              The explanation is credible: it’s the same person under another
              form of their name.
            </small>
          </span>
        </label>
        <label
          className={`review-choice ${decision === 'DECLINE' ? 'selected' : ''}`}
        >
          <input
            type="radio"
            name="decision"
            checked={decision === 'DECLINE'}
            onChange={() => setDecision('DECLINE')}
          />
          <span>
            <strong>Decline</strong>
            <small>It could be someone else’s account, or you need more.</small>
          </span>
        </label>
        {decision === 'DECLINE' && (
          <div className="review-reason">
            <label htmlFor="decline-reason">What should they know?</label>
            <textarea
              id="decline-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={5}
              maxLength={500}
              rows={4}
              placeholder="For example: we can’t link these names. Add an account in your verified name."
            />
            <small>The creator sees this and can ask again.</small>
          </div>
        )}
        <label className="review-confirm">
          <input key={decision} type="checkbox" required />
          <span>
            {decision === 'APPROVE'
              ? 'I’m satisfied this account belongs to the verified person.'
              : 'I’ve read their explanation.'}
          </span>
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
            ? 'Approve account'
            : 'Decline'}
      </button>
    </form>
  );
}
