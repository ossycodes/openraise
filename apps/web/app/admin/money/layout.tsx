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
        <strong>Money operations</strong>
        <span>
          Inspect postings and reconcile against provider evidence. Payout retries
          require a confirmed return and a recorded reason.
        </span>
      </div>
      <MoneyNav />
      <div className="money-workspace">{children}</div>
    </>
  );
}
