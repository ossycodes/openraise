import Link from 'next/link';
import { apiAs } from '../_lib/api';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '../_components/site-header';
import { DashboardNav } from './_components/dashboard-nav';

export const metadata: Metadata = {
  title: { default: 'Dashboard', template: '%s | Dashboard' },
  robots: { index: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await apiAs<{ role: string }>('/users/me', {
    returnTo: '/dashboard',
  });
  return (
    <>
      <SiteHeader oneTap={false} />
      <main id="main" className="dashboard">
        <DashboardNav />
        {user.role === 'ADMIN' && (
          <Link className="review-entry" href="/admin/campaigns">
            Open campaign review workspace →
          </Link>
        )}
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
