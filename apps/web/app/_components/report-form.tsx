'use client';
import { useRef, useState } from 'react';
import { Flag, Check } from 'lucide-react';
export function ReportForm({ slug }: { slug: string }) {
  const [category, setCategory] = useState('MISLEADING'),
    [details, setDetails] = useState(''),
    [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState('');
  const attempt = useRef<{
    key: string;
    category: string;
    details: string;
  } | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setLocked(true);
    setError('');
    const payload = attempt.current ?? {
      key: crypto.randomUUID(),
      category,
      details: details.trim(),
    };
    attempt.current = payload;
    try {
      const { key, ...body } = payload;
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(slug)}/reports`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': key,
          },
          body: JSON.stringify(body),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        if (response.status < 500) {
          attempt.current = null;
          setLocked(false);
        }
        throw new Error(
          typeof data.message === 'string'
            ? data.message
            : 'Check the category and description.',
        );
      }
      if (data.received !== true)
        throw new Error(
          'Receipt could not be confirmed. Retry this same report.',
        );
      setDone(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Receipt could not be confirmed. Retry this same report.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="campaign-report">
      <summary>
        <Flag size={15} aria-hidden="true" />
        Report this campaign
      </summary>
      {done ? (
        <div className="report-received" role="status">
          <Check size={23} aria-hidden="true" />
          <h3>Report received.</h3>
          <p>
            An administrator can now review your concern. Reporting does not
            automatically pause a campaign.
          </p>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)}>
          <h3>Help us look closer.</h3>
          <p>
            No account or email required. Your report is shared with site
            administrators, not displayed publicly or sent to the organiser.
          </p>
          <fieldset disabled={locked || busy}>
            <legend className="sr-only">Your concern</legend>
            <label htmlFor={`report-category-${slug}`}>
              What concerns you?
            </label>
            <select
              id={`report-category-${slug}`}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="MISLEADING">Misleading information</option>
              <option value="FRAUD">Suspected fraud</option>
              <option value="OFFENSIVE">Offensive or harmful content</option>
              <option value="OTHER">Something else</option>
            </select>
            <label htmlFor={`report-details-${slug}`}>
              Tell us what you noticed
            </label>
            <textarea
              id={`report-details-${slug}`}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              minLength={20}
              maxLength={2000}
              rows={5}
              required
              placeholder="Describe the specific information that needs a closer look."
            />
            <small>
              20–2,000 characters. Please leave out payment details and
              sensitive personal information.
            </small>
          </fieldset>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="secondary-button" disabled={busy}>
            {busy
              ? 'Sending report…'
              : locked
                ? 'Retry same report'
                : 'Send private report'}
          </button>
        </form>
      )}
    </details>
  );
}
