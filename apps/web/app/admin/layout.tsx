import { WorkspaceNav } from './_components/workspace-nav';
import Link from 'next/link';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { apiAs } from '../_lib/api';
import { Brand } from '../_components/site-header';
export const metadata = {
  title: { default: 'Campaign review', template: '%s | Admin' },
  robots: { index: false, follow: false },
};
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await apiAs<{ name: string; role: string }>('/users/me', {
    returnTo: '/admin/campaigns',
  });
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="review-header">
        <Brand />
        <span>
          <ShieldCheck size={17} aria-hidden="true" /> Admin workspace
        </span>
        <Link href="/dashboard">
          <ArrowLeft size={15} aria-hidden="true" /> Dashboard
        </Link>
      </header>
      {user.role === 'ADMIN' ? (
        <main id="main" className="review-workspace">
          <WorkspaceNav />
          {children}
        </main>
      ) : (
        <main id="main" className="review-denied">
          <ShieldCheck size={38} aria-hidden="true" />
          <h1>Administrator access needed</h1>
          <p>
            This workspace is for administrators. Your creator dashboard is
            still available.
          </p>
          <Link className="primary-button" href="/dashboard">
            Return to your dashboard
          </Link>
        </main>
      )}
    </>
  );
}
