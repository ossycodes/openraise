'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardCheck, Flag, IdCard } from 'lucide-react';
export function WorkspaceNav() {
  const path = usePathname();
  return (
    <nav className="workspace-nav" aria-label="Admin workspace">
      <Link
        href="/admin/campaigns"
        aria-current={path.startsWith('/admin/campaigns') ? 'page' : undefined}
      >
        <ClipboardCheck size={16} aria-hidden="true" />
        Campaign review
      </Link>
      <Link
        href="/admin/reports"
        aria-current={path.startsWith('/admin/reports') ? 'page' : undefined}
      >
        <Flag size={16} aria-hidden="true" />
        Reports & moderation
      </Link>
      <Link
        href="/admin/verifications"
        aria-current={
          path.startsWith('/admin/verifications') ? 'page' : undefined
        }
      >
        <IdCard size={16} aria-hidden="true" />
        Identity checks
      </Link>
    </nav>
  );
}
