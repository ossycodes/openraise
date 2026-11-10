import Link from 'next/link';
import { ArrowUpRight, Building2 } from 'lucide-react';
import { apiAs } from '../../_lib/api';
import { createOrganisation } from '../organisation-actions';
import { ROLE_LABEL, type MyOrganisation } from './types';

export const metadata = { title: 'Organisations' };

export default async function OrganisationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const returnTo = '/dashboard/organisations';
  const [orgs, { error, notice }] = await Promise.all([
    apiAs<MyOrganisation[]>('/organisations/mine', { returnTo }),
    searchParams,
  ]);
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <div className="section-eyebrow">Organisations</div>
          <h1>Raise as a team</h1>
          <p className="dashboard-lede">
            For NGOs, charities, churches and companies. Invite the people you
            work with and give each of them the right role.
          </p>
        </div>
      </div>
      {error && (
        <p className="dashboard-notice error" role="alert">
          {error}
        </p>
      )}
      {notice === 'left' && (
        <p className="dashboard-notice" role="status">
          You left the organisation.
        </p>
      )}
      <div className="dashboard-columns">
        <div className="dashboard-main">
          <section className="dashboard-panel" aria-labelledby="orgs-title">
            <h2 id="orgs-title">Your organisations</h2>
            {orgs.length === 0 ? (
              <p className="field-hint">
                You’re not part of an organisation yet. Create one, or ask to be
                invited to yours.
              </p>
            ) : (
              <ul className="org-list">
                {orgs.map((o) => (
                  <li key={o.id}>
                    <Link href={`/dashboard/organisations/${o.id}`}>
                      <Building2 size={20} strokeWidth={1.6} aria-hidden="true" />
                      <span>
                        <strong>{o.name}</strong>
                        <small>{ROLE_LABEL[o.role]}</small>
                      </span>
                      <ArrowUpRight size={17} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="dashboard-side">
          <section className="dashboard-panel" aria-labelledby="new-org-title">
            <h2 id="new-org-title">Create an organisation</h2>
            <form action={createOrganisation} className="campaign-form org-form">
              <div className="form-field">
                <label htmlFor="org-name">Name</label>
                <input
                  id="org-name"
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Hope Foundation Lagos"
                />
              </div>
              <div className="form-field">
                <label htmlFor="org-location">
                  Location <span className="optional">optional</span>
                </label>
                <input id="org-location" name="location" maxLength={100} />
              </div>
              <div className="form-actions">
                <button type="submit" className="primary-button">
                  Create organisation
                </button>
              </div>
              <p className="field-hint">
                You’ll be its owner. You can add a description and website next.
              </p>
            </form>
          </section>
        </aside>
      </div>
    </>
  );
}
