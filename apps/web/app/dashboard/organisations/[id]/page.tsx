import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, Mail } from 'lucide-react';
import { ApiError, apiAs } from '../../../_lib/api';
import {
  changeMemberRole,
  inviteMember,
  removeMember,
  revokeInvite,
  saveOrganisation,
} from '../../organisation-actions';
import {
  ROLE_HINT,
  ROLE_LABEL,
  type OrganisationManage,
  type OrganisationRole,
} from '../types';

export const metadata = { title: 'Organisation' };

const NOTICES: Record<string, string> = {
  created: 'Organisation created. Add a description, then invite your team.',
  saved: 'Profile saved.',
  revoked: 'Invitation withdrawn.',
  role: 'Role changed.',
  removed: 'They were removed from the organisation.',
  joined: 'Welcome to the team.',
};

const date = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Lagos',
});

export default async function OrganisationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string; email?: string }>;
}) {
  const { id } = await params;
  const { error, notice, email } = await searchParams;
  const returnTo = `/dashboard/organisations/${id}`;
  let d: OrganisationManage;
  try {
    d = await apiAs<OrganisationManage>(
      `/organisations/${encodeURIComponent(id)}/manage`,
      { returnTo },
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const { organisation: org, myRole, members, invites } = d;
  const manager = myRole === 'OWNER' || myRole === 'ADMIN';
  /** Roles this person may give: admins can't create owners. */
  const assignable: OrganisationRole[] =
    myRole === 'OWNER'
      ? ['OWNER', 'ADMIN', 'EDITOR', 'FINANCE']
      : ['ADMIN', 'EDITOR', 'FINANCE'];
  const me = members.find((m) => m.you)!;

  return (
    <>
      <Link className="review-back" href="/dashboard/organisations">
        <ArrowLeft size={16} aria-hidden="true" /> All organisations
      </Link>
      <div className="dashboard-heading">
        <div>
          <div className="section-eyebrow">
            Organisation · you are {ROLE_LABEL[myRole].toLowerCase()}
          </div>
          <h1>{org.name}</h1>
        </div>
        <Link className="secondary-button" href={`/organisations/${org.slug}`}>
          Public profile <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {error && (
        <p className="dashboard-notice error" role="alert">
          {error}
        </p>
      )}
      {notice === 'invited' && (
        <p className="dashboard-notice" role="status">
          Invitation sent to {email}. It works for 7 days.
        </p>
      )}
      {notice === 'invite-not-emailed' && (
        <p className="dashboard-notice error" role="alert">
          The invitation to {email} was created, but the email didn’t send.
          Send it again in a moment.
        </p>
      )}
      {notice && NOTICES[notice] && (
        <p className="dashboard-notice" role="status">
          {NOTICES[notice]}
        </p>
      )}

      <div className="dashboard-columns">
        <div className="dashboard-main">
          <section className="dashboard-panel" aria-labelledby="team-title">
            <h2 id="team-title">Team</h2>
            <ul className="org-members">
              {members.map((m) => {
                const canEdit =
                  manager &&
                  !m.you &&
                  (myRole === 'OWNER' || m.role !== 'OWNER');
                return (
                  <li key={m.id}>
                    <div>
                      <strong>
                        {m.name}
                        {m.you && <span className="org-you"> (you)</span>}
                      </strong>
                      <small>
                        {m.email} · joined {date.format(new Date(m.joinedAt))}
                      </small>
                    </div>
                    {canEdit ? (
                      <div className="org-member-actions">
                        <form action={changeMemberRole}>
                          <input type="hidden" name="id" value={org.id} />
                          <input type="hidden" name="memberId" value={m.id} />
                          <label className="sr-only" htmlFor={`role-${m.id}`}>
                            Role for {m.name}
                          </label>
                          <select
                            id={`role-${m.id}`}
                            name="role"
                            defaultValue={m.role}
                          >
                            {assignable.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="text-button">
                            Change
                          </button>
                        </form>
                        <form action={removeMember}>
                          <input type="hidden" name="id" value={org.id} />
                          <input type="hidden" name="memberId" value={m.id} />
                          <button
                            type="submit"
                            className="text-button"
                            aria-label={`Remove ${m.name}`}
                          >
                            Remove
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span className="status-pill status-active">
                        {ROLE_LABEL[m.role]}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <form action={removeMember} className="org-leave">
              <input type="hidden" name="id" value={org.id} />
              <input type="hidden" name="memberId" value={me.id} />
              <input type="hidden" name="leaving" value="1" />
              <button type="submit" className="text-button">
                Leave this organisation
              </button>
            </form>
          </section>

          {manager && (
            <section className="dashboard-panel" aria-labelledby="profile-title">
              <h2 id="profile-title">Public profile</h2>
              <form action={saveOrganisation} className="campaign-form org-form">
                <input type="hidden" name="id" value={org.id} />
                <div className="form-field">
                  <label htmlFor="org-name">Name</label>
                  <input
                    id="org-name"
                    name="name"
                    defaultValue={org.name}
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="org-about">
                    About <span className="optional">optional</span>
                  </label>
                  <textarea
                    id="org-about"
                    name="about"
                    defaultValue={org.about}
                    maxLength={2000}
                    rows={5}
                    placeholder="What you do, who you serve and since when."
                  />
                </div>
                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="org-website">
                      Website <span className="optional">optional</span>
                    </label>
                    <input
                      id="org-website"
                      name="website"
                      type="url"
                      defaultValue={org.website ?? ''}
                      maxLength={200}
                      placeholder="https://"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="org-location">
                      Location <span className="optional">optional</span>
                    </label>
                    <input
                      id="org-location"
                      name="location"
                      defaultValue={org.location ?? ''}
                      maxLength={100}
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="primary-button">
                    Save profile
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>

        {manager && (
          <aside className="dashboard-side">
            <section className="dashboard-panel" aria-labelledby="invite-title">
              <h2 id="invite-title">Invite someone</h2>
              <form action={inviteMember} className="campaign-form org-form">
                <input type="hidden" name="id" value={org.id} />
                <div className="form-field">
                  <label htmlFor="invite-email">Email</label>
                  <input
                    id="invite-email"
                    name="email"
                    type="email"
                    required
                    maxLength={254}
                  />
                </div>
                <fieldset className="org-roles">
                  <legend>Role</legend>
                  {assignable.map((r) => (
                    <label key={r}>
                      <input
                        type="radio"
                        name="role"
                        value={r}
                        defaultChecked={r === 'EDITOR'}
                        required
                      />
                      <span>
                        <strong>{ROLE_LABEL[r]}</strong>
                        <small>{ROLE_HINT[r]}</small>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <div className="form-actions">
                  <button type="submit" className="primary-button">
                    <Mail size={16} aria-hidden="true" /> Send invitation
                  </button>
                </div>
              </form>
              {invites && invites.length > 0 && (
                <>
                  <h3 className="org-subhead">Waiting to accept</h3>
                  <ul className="org-invites">
                    {invites.map((i) => (
                      <li key={i.id}>
                        <span>
                          <strong>{i.email}</strong>
                          <small>
                            {ROLE_LABEL[i.role]} · until{' '}
                            {date.format(new Date(i.expiresAt))}
                          </small>
                        </span>
                        <form action={revokeInvite}>
                          <input type="hidden" name="id" value={org.id} />
                          <input type="hidden" name="inviteId" value={i.id} />
                          <button
                            type="submit"
                            className="text-button"
                            aria-label={`Withdraw invitation to ${i.email}`}
                          >
                            Withdraw
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </aside>
        )}
      </div>
    </>
  );
}
