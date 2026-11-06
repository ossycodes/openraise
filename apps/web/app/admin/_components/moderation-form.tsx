'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ACTION_LABEL, type ReportDetail } from '../reports/types';
export function ModerationForm({ detail }: { detail: ReportDetail }) {
  const { report, campaign, controls } = detail;
  const options = [
    ...(!controls.moderationPaused &&
    ['ACTIVE', 'PAUSED'].includes(campaign.status)
      ? ['PAUSE']
      : []),
    ...(controls.moderationPaused ? ['LIFT_PAUSE'] : []),
    controls.payoutsFrozen ? 'UNFREEZE' : 'FREEZE',
    ...(report.status === 'OPEN' ? ['RESOLVE', 'DISMISS'] : []),
  ];
  const [action, setAction] = useState(options[0]),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const router = useRouter();
  const impact: Record<string, string> = {
    PAUSE:
      'Stops new donations and prevents the creator from resuming until an admin lifts the restriction.',
    LIFT_PAUSE:
      'Removes the admin restriction. The campaign stays paused until the creator resumes it.',
    FREEZE:
      'Blocks new withdrawal requests. Transfers already reserved or dispatched may still complete.',
    UNFREEZE:
      'Allows new withdrawal requests, subject to the usual payout checks.',
    RESOLVE:
      'Closes this report as resolved. Existing pauses and payout freezes stay in place.',
    DISMISS:
      'Closes this report without further action. Existing pauses and payout freezes stay in place.',
  };
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/reports/${report.id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reason: reason.trim(),
          expectedReportUpdatedAt: report.updatedAt,
          expectedCampaignUpdatedAt: controls.updatedAt,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data.message === 'string'
            ? data.message
            : 'Check your action and reason.',
        );
      router.replace(`/admin/reports/${report.id}?recorded=1`);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'The action could not be confirmed. Reload before retrying.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="review-decision-form moderation-form"
      onSubmit={(e) => void submit(e)}
    >
      <div className="section-eyebrow">A measured response</div>
      <h2>Record your next step</h2>
      <p>
        Choose one action at a time. Each action is recorded with your account
        and reason.
      </p>
      <fieldset disabled={busy}>
        <legend className="sr-only">Moderation action</legend>
        <label htmlFor="moderation-action">Action</label>
        <select
          id="moderation-action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          {options.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABEL[a]}
            </option>
          ))}
        </select>
        <p className="moderation-impact">{impact[action]}</p>
        <label htmlFor="moderation-reason">Action reason</label>
        <textarea
          id="moderation-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={5}
          maxLength={500}
          rows={4}
          placeholder="Explain the evidence and why this action is appropriate."
        />
        <small>
          {action === 'PAUSE' || action === 'FREEZE'
            ? 'The organiser can see this restriction reason. Do not copy private report details.'
            : 'This reason stays in the private moderation history.'}
        </small>
        <label className="review-confirm">
          <input key={action} type="checkbox" required />
          <span>
            I’ve reviewed the report, campaign and the effect of this action.
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
        {busy ? 'Recording action…' : ACTION_LABEL[action]}
      </button>
    </form>
  );
}
