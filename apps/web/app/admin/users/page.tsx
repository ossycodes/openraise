import Link from 'next/link';
import { apiAs } from '../../_lib/api';
import { pageNumber } from '../money/types';
export const metadata = { title: 'Users' };
export default async function Users({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams,
    page = pageNumber(params.page),
    q = (params.q ?? '').trim().slice(0, 100);
  const data = await apiAs<{
    items: {
      id: string;
      name: string;
      email: string;
      role: string;
      emailVerifiedAt: string | null;
    }[];
    total: number;
    limit: number;
  }>(`/admin/users?${new URLSearchParams({ q, page: String(page) })}`, {
    returnTo: '/admin/users',
  });
  return (
    <>
      <div className="review-title">
        <div>
          <div className="section-eyebrow">Account access</div>
          <h1>Users</h1>
          <p>Review accounts, manage roles and end active sessions.</p>
        </div>
      </div>
      <form className="review-search" action="/admin/users">
        <label className="sr-only" htmlFor="user-search">
          Search users
        </label>
        <input
          id="user-search"
          name="q"
          defaultValue={q}
          maxLength={100}
          placeholder="Name or email"
        />
        <button>Search</button>
      </form>
      <p>{data.total} users</p>
      <div className="admin-record-list">
        {data.items.map((user) => (
          <Link key={user.id} href={`/admin/users/${user.id}`}>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
            <span>
              {user.role === 'ADMIN' ? 'Administrator' : 'Member'} ·{' '}
              {user.emailVerifiedAt ? 'Email verified' : 'Email unverified'}
            </span>
          </Link>
        ))}
        {!data.items.length && <p>No users match your search.</p>}
      </div>
      <nav className="review-pagination" aria-label="User pages">
        {page > 1 && (
          <Link href={`?${new URLSearchParams({ q, page: String(page - 1) })}`}>
            ← Previous
          </Link>
        )}
        <span>Page {page}</span>
        {page * data.limit < data.total && (
          <Link href={`?${new URLSearchParams({ q, page: String(page + 1) })}`}>
            Next →
          </Link>
        )}
      </nav>
    </>
  );
}
