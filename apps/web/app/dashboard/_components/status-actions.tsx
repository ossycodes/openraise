'use client';

import { useActionState } from 'react';
import { changeStatus, deleteDraft, type FormState } from '../actions';
import type { CampaignStatus } from '../_lib/types';

const FIELD_LABEL: Record<string, string> = {
  summary: 'Summary',
  story: 'Story',
  endsAt: 'End date',
};

/** The buttons that move a campaign through its lifecycle. */
export function StatusActions({
  id,
  status,
  moderationPaused = false,
}: {
  id: string;
  status: CampaignStatus;
  moderationPaused?: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    changeStatus,
    {},
  );
  const button = (name: string, label: string, primary = false) => (
    <button
      type="submit"
      name="action"
      value={name}
      className={primary ? 'primary-button' : 'secondary-button'}
      disabled={pending}
    >
      {label}
    </button>
  );
  const errors = Object.entries(state.errors ?? {});
  return (
    <div className="status-actions">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <div className="status-buttons">
          {(status === 'DRAFT' || status === 'REJECTED') &&
            button('submit', 'Submit for review', true)}
          {status === 'ACTIVE' && button('pause', 'Pause donations')}
          {status === 'PAUSED' &&
            !moderationPaused &&
            button('resume', 'Resume donations', true)}
        </div>
        {(state.message || errors.length > 0) && (
          <div className="status-problems" role="alert">
            <p>{state.message}</p>
            {errors.length > 0 && (
              <ul>
                {errors.map(([field, message]) => (
                  <li key={field}>
                    <a href={`#${field}`}>{FIELD_LABEL[field] ?? field}</a>:{' '}
                    {message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {(status === 'ACTIVE' || status === 'PAUSED') && (
          <details className="danger-zone">
            <summary>End this campaign</summary>
            <p>
              Ending stops new donations for good. Money already raised stays
              yours to withdraw.
            </p>
            {button('end', 'End campaign')}
          </details>
        )}
      </form>
      {status === 'DRAFT' && (
        <details className="danger-zone">
          <summary>Delete this draft</summary>
          <p>The draft and its photos are removed. This can’t be undone.</p>
          <form action={deleteDraft}>
            <input type="hidden" name="id" value={id} />
            <button type="submit" className="secondary-button danger">
              Delete draft
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
