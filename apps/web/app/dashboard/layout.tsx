import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '../_components/site-header';
import { DashboardNav } from './_components/dashboard-nav';

export const metadata: Metadata = {
  title: { default: 'Dashboard', template: '%s | Dashboard' },
  robots: { index: false },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader oneTap={false} />
      <main id="main" className="dashboard">
        <DashboardNav />
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
