import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiAs, ApiError } from '../../../_lib/api';
import { OperationForm } from '../../_components/operation-form';
import { reviewDate } from '../../types';
export const metadata = { title: 'Manage user' };
export default async function User({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let user: {
    id: string;
    canManageAccess: boolean;
    name: string;
    email: string;
    role: string;
    updatedAt: string;
    createdAt: string;
    emailVerifiedAt: string | null;
    _count: { campaigns: number; donations: number };
  };
  try {
    user = await apiAs(`/admin/users/${encodeURIComponent(id)}`, {
      returnTo: `/admin/users/${id}`,
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  return (
    <>
      <Link href="/admin/users" className="review-back">
        ← Users
      </Link>
      <div className="review-title">
        <div>
          <div className="section-eyebrow">Account access</div>
          <h1>{user.name}</h1>
          <p>{user.email}</p>
        </div>
      </div>
      <dl className="money-facts">
        <div>
          <dt>Joined</dt>
          <dd>{reviewDate(user.createdAt)}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{user.emailVerifiedAt ? 'Verified' : 'Unverified'}</dd>
        </div>
        <div>
          <dt>Campaigns</dt>
          <dd>{user._count.campaigns}</dd>
        </div>
        <div>
          <dt>Donations</dt>
          <dd>{user._count.donations}</dd>
        </div>
      </dl>
      {user.canManageAccess ? (
        <div className="admin-operation-grid">
          <OperationForm
            key={`role-${user.updatedAt}`}
            title="Change account role"
            description="Administrator access includes identity records, moderation and money operations. Changing a role signs the person out on every device."
            path={`users/${id}/actions`}
            fixed={{ action: 'SET_ROLE', expectedUpdatedAt: user.updatedAt }}
            fields={[
              {
                name: 'role',
                label: 'Role',
                value: user.role,
                options: [
                  { value: 'USER', label: 'Member' },
                  { value: 'ADMIN', label: 'Administrator' },
                ],
              },
            ]}
            confirmation="I have reviewed the access this role grants."
          />
          <OperationForm
            key={`sessions-${user.updatedAt}`}
            title="End all sessions"
            description="Signs this person out everywhere. They can sign in again with their credentials."
            path={`users/${id}/actions`}
            fixed={{
              action: 'REVOKE_SESSIONS',
              expectedUpdatedAt: user.updatedAt,
            }}
            confirmation="End every active session for this person."
            submitLabel="End sessions"
          />
        </div>
      ) : (
        <p>Ask another administrator to manage your account access.</p>
      )}
    </>
  );
}
