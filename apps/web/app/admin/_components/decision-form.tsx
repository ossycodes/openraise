'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, CornerUpLeft } from 'lucide-react';
export function DecisionForm({ id, version }: { id: string; version: string }) {
  const router = useRouter();
  const [decision, setDecision] = useState('APPROVE');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/admin/campaigns/${encodeURIComponent(id)}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision,
            expectedUpdatedAt: version,
            ...(decision === 'REJECT' ? { reason: reason.trim() } : {}),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data.message === 'string'
            ? data.message
            : 'The decision could not be confirmed. Reload the campaign before trying again.',
        );
      setDone(
        decision === 'APPROVE'
          ? 'Campaign approved and published.'
          : 'Campaign returned to the creator with your reason.',
      );
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'The decision could not be confirmed. Reload before trying again.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <div className="review-decision-success" role="status">
        <Check size={28} aria-hidden="true" />
        <h2>Decision recorded</h2>
        <p>{done}</p>
        <Link className="primary-button" href="/admin/campaigns">
          Back to the queue
        </Link>
      </div>
    );
  return (
    <form onSubmit={(e) => void submit(e)} className="review-decision-form">
      <div className="section-eyebrow">Your decision</div>
      <h2>Ready for the next step?</h2>
      <p>
        Read the full story and check the media before making a publishing
        decision.
      </p>
      <fieldset disabled={busy}>
        <legend>Choose an outcome</legend>
        <label
          className={`review-choice ${decision === 'APPROVE' ? 'selected' : ''}`}
        >
          <input
            type="radio"
            name="decision"
            value="APPROVE"
            checked={decision === 'APPROVE'}
            onChange={() => setDecision('APPROVE')}
          />
          <span>
            <strong>Approve & publish</strong>
            <small>Make this campaign public.</small>
          </span>
          <Check size={18} aria-hidden="true" />
        </label>
        <label
          className={`review-choice ${decision === 'REJECT' ? 'selected' : ''}`}
        >
          <input
            type="radio"
            name="decision"
            value="REJECT"
            checked={decision === 'REJECT'}
            onChange={() => setDecision('REJECT')}
          />
          <span>
            <strong>Return for changes</strong>
            <small>Explain what the creator needs to fix.</small>
          </span>
          <CornerUpLeft size={18} aria-hidden="true" />
        </label>
        {decision === 'REJECT' && (
          <div className="review-reason">
            <label htmlFor="review-reason">Reason for returning</label>
            <textarea
              id="review-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              maxLength={1000}
              rows={5}
              placeholder="Be specific, constructive and clear."
            />
            <small>The creator will see this reason in their dashboard.</small>
          </div>
        )}
        <label className="review-confirm">
          <input type="checkbox" required />
          <span>I’ve reviewed this submission and its supporting media.</span>
        </label>
      </fieldset>
      {error && (
        <div role="alert" className="review-decision-error">
          <p>{error}</p>
          <button type="button" onClick={() => location.reload()}>
            Reload latest submission
          </button>
        </div>
      )}
      <button className="primary-button" type="submit" disabled={busy}>
        {busy
          ? 'Recording decision…'
          : decision === 'APPROVE'
            ? 'Approve & publish campaign'
            : 'Return to creator'}
      </button>
      <small className="review-audit-note">
        Your decision and reviewer account are recorded. Approval publishes
        immediately.
      </small>
    </form>
  );
}
