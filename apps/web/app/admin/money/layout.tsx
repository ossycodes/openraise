import type { ReactNode } from 'react';
import { LockKeyhole } from 'lucide-react';
import { MoneyNav } from './_components/money-nav';
export const metadata = {
  title: { default: 'Money operations', template: '%s | Money operations' },
};
export default function MoneyLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="money-readonly">
        <LockKeyhole size={15} aria-hidden="true" />
        <strong>Read-only workspace</strong>
        <span>
          Inspect records and postings. No transfers or adjustments are made
          here.
        </span>
      </div>
      <MoneyNav />
      <div className="money-workspace">{children}</div>
    </>
  );
}
