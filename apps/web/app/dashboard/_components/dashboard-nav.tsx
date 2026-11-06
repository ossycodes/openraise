'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard', label: 'Campaigns' },
  { href: '/dashboard/payouts', label: 'Payout accounts' },
];

/** Top-level dashboard sections. */
export function DashboardNav() {
  const path = usePathname();
  const current = path.startsWith('/dashboard/payouts')
    ? '/dashboard/payouts'
    : '/dashboard';
  return (
    <nav className="dashboard-nav" aria-label="Dashboard">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={current === l.href ? 'page' : undefined}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** Switch between a campaign's details and its money. */
export function CampaignTabs({ id }: { id: string }) {
  const path = usePathname();
  const tabs = [
    { href: `/dashboard/campaigns/${id}`, label: 'Details' },
    { href: `/dashboard/campaigns/${id}/money`, label: 'Money' },
    { href: `/dashboard/campaigns/${id}/updates`, label: 'Updates' },
  ];
  return (
    <nav className="campaign-tabs" aria-label="Campaign">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={path === t.href ? 'page' : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
