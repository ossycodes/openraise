'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export function MoneyNav() {
  const path = usePathname();
  return (
    <nav className="campaign-tabs money-tabs" aria-label="Money workspace">
      {[
        ['/admin/money', 'Overview'],
        ['/admin/money/ledger', 'Ledger'],
        ['/admin/money/reconciliation', 'Reconciliation'],
      ].map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={
            (href === '/admin/money' ? path === href : path.startsWith(href))
              ? 'page'
              : undefined
          }
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
