import Link from 'next/link';
import { History, ShieldCheck, ArrowRight } from 'lucide-react';
import { ApiError, apiAs } from '../../_lib/api';
import { ACTIONS, SYSTEM_ACTORS, type AuditPage } from './types';
export const metadata = { title: 'Audit log' };
const fieldLabel: Record<string, string> = {
  status: 'Status',
  moderationPaused: 'Moderation pause',
  payoutsFrozen: 'Payout freeze',
  role: 'Role',
  isDefault: 'Default account',
  removed: 'Removed',
};
function value(v: string | number | boolean | null | undefined) {
  return v === undefined
    ? 'Not present'
    : v === null
      ? 'Not set'
      : typeof v === 'number'
        ? String(v)
        : typeof v === 'boolean'
          ? v
            ? 'Yes'
            : 'No'
          : v.replaceAll('_', ' ');
}
export default async function AuditLog({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const scalar = (key: string) =>
    typeof raw[key] === 'string' ? (raw[key] as string) : '';
  const q = scalar('q').trim().slice(0, 100);
  const action = Object.hasOwn(ACTIONS, scalar('action'))
    ? scalar('action')
    : '';
  const day = (v: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v
      ? v
      : '';
  const from = day(scalar('from')),
    to = day(scalar('to'));
  const requested = Number(scalar('page'));
  const page =
    Number.isInteger(requested) && requested >= 1 && requested <= 1000
      ? requested
      : 1;
  const invalidRange = Boolean(from && to && from > to);
  const params = new URLSearchParams({
    page: String(page),
    q,
    action,
    from,
    to,
  });
  let data: AuditPage | null = null;
  let denied = false;
  if (!invalidRange) {
    try {
      data = await apiAs<AuditPage>(`/admin/audit?${params}`, {
        returnTo: `/admin/audit?${params}`,
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) denied = true;
      else if (
        !(e instanceof ApiError) &&
        !(e instanceof TypeError) &&
        !(e instanceof Error && e.name === 'TimeoutError')
      )
        throw e;
    }
  }
  const href = (n: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(n));
    return `?${next}`;
  };
  return (
    <>
      <div className="review-title audit-heading">
        <div>
          <div className="section-eyebrow">The record behind the decision</div>
          <h1>Audit log</h1>
          <p>Follow sensitive changes, one committed action at a time.</p>
        </div>
        <History size={36} strokeWidth={1.3} aria-hidden="true" />
      </div>
      <div className="audit-scope">
        <ShieldCheck size={20} aria-hidden="true" />
        <p>
          <strong>A protected record.</strong> Before and after states are
          captured with each change. Personal details and decision notes stay in
          their original private views.
        </p>
      </div>
      <form action="/admin/audit" className="audit-filters">
        <div>
          <label htmlFor="audit-q">Actor, subject, target or event ID</label>
          <input
            id="audit-q"
            name="q"
            defaultValue={q}
            maxLength={100}
            placeholder="Paste an exact ID"
          />
        </div>
        <div>
          <label htmlFor="audit-action">Action</label>
          <select id="audit-action" name="action" defaultValue={action}>
            <option value="">All actions</option>
            {Object.entries(ACTIONS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-from">From (UTC)</label>
          <input id="audit-from" name="from" type="date" defaultValue={from} />
        </div>
        <div>
          <label htmlFor="audit-to">Through (UTC)</label>
          <input id="audit-to" name="to" type="date" defaultValue={to} />
        </div>
        <button className="primary-button" type="submit">
          Filter history
        </button>
        <Link href="/admin/audit">Clear filters</Link>
      </form>
      {invalidRange ? (
        <div className="review-empty" role="alert">
          <h2>Check the date range.</h2>
          <p>The end date must be on or after the start date.</p>
        </div>
      ) : denied ? (
        <div className="review-empty">
          <h2>Administrator access needed.</h2>
          <Link href="/dashboard">Return to dashboard</Link>
        </div>
      ) : !data ? (
        <section className="review-empty" role="alert">
          <h2>The audit history couldn’t load.</h2>
          <p>Try again to read the latest records.</p>
          <Link className="secondary-button" href={`/admin/audit?${params}`}>
            Reload history
          </Link>
        </section>
      ) : (
        <>
          <div className="audit-list-heading">
            <h2>Recorded changes</h2>
            <span>Page {data.page} · newest first</span>
          </div>
          {!data.items.length ? (
            <section className="review-empty">
              <History size={32} aria-hidden="true" />
              <h2>No matching changes.</h2>
              <p>
                Events appear here as sensitive changes are committed after
                audit logging is installed.
              </p>
              <Link href="/admin/audit">View all history</Link>
            </section>
          ) : (
            <ol className="audit-events">
              {data.items.map((event) => {
                const fields = [
                  ...new Set([
                    ...Object.keys(event.before ?? {}),
                    ...Object.keys(event.after ?? {}),
                  ]),
                ];
                return (
                  <li key={event.id}>
                    <article>
                      <div className="audit-event-heading">
                        <span className="audit-action">
                          {ACTIONS[event.action] ?? 'Sensitive change'}
                        </span>
                        <time dateTime={event.createdAt}>
                          {new Intl.DateTimeFormat('en-GB', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                            timeZone: 'Africa/Lagos',
                          }).format(new Date(event.createdAt))}{' '}
                          WAT
                        </time>
                      </div>
                      <dl className="audit-identifiers">
                        <div>
                          <dt>Actor</dt>
                          <dd>
                            {event.actorId ? (
                              <Link
                                href={`?q=${encodeURIComponent(event.actorId)}`}
                              >
                                {SYSTEM_ACTORS[event.actorId] ?? event.actorId}
                              </Link>
                            ) : (
                              <span className="audit-unattributed">
                                Unattributed database change
                              </span>
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>
                            {event.targetType.replace(
                              /([a-z])([A-Z])/g,
                              '$1 $2',
                            )}
                          </dt>
                          <dd>
                            <Link
                              href={`?q=${encodeURIComponent(event.targetId)}`}
                            >
                              {event.targetId}
                            </Link>
                          </dd>
                        </div>
                        {event.subjectId && (
                          <div>
                            <dt>Subject</dt>
                            <dd>
                              <Link
                                href={`?q=${encodeURIComponent(event.subjectId)}`}
                              >
                                {event.subjectId}
                              </Link>
                            </dd>
                          </div>
                        )}
                      </dl>
                      <details className="audit-comparison">
                        <summary>View before &amp; after</summary>
                        <div className="audit-change-labels" aria-hidden="true">
                          <span>Field</span>
                          <span>Before</span>
                          <span>After</span>
                        </div>
                        {fields.map((field) => (
                          <div className="audit-change" key={field}>
                            <strong>{fieldLabel[field] ?? field}</strong>
                            <span>
                              <small>Before</small>
                              {value(event.before?.[field])}
                            </span>
                            <span>
                              <small>After</small>
                              {value(event.after?.[field])}
                            </span>
                          </div>
                        ))}
                        <p className="audit-event-id">Event {event.id}</p>
                      </details>
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
          <nav className="audit-pagination" aria-label="Audit history pages">
            {page > 1 ? (
              <Link className="secondary-button" href={href(page - 1)}>
                ← Newer records
              </Link>
            ) : (
              <span />
            )}
            {data.hasMore && page < 1000 && (
              <Link className="secondary-button" href={href(page + 1)}>
                Older records <ArrowRight size={15} aria-hidden="true" />
              </Link>
            )}
          </nav>
        </>
      )}
      <p className="audit-footnote">
        Dates above use West Africa Time; date filters use UTC. Logging begins
        when the audit migration is installed. Earlier activity is not
        reconstructed. Unattributed means no application actor was recorded.
      </p>
    </>
  );
}
