import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '../_components/site-header';

export const metadata: Metadata = {
  title: { default: 'Dashboard', template: '%s | Dashboard' },
  robots: { index: false },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader oneTap={false} />
      <main id="main" className="dashboard">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
