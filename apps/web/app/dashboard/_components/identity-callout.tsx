import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import type { IdentityStatus } from '../_lib/types';

const NEEDED = {
  publish: 'Verify your identity before you submit a campaign for review.',
  withdraw: 'Verify your identity before you withdraw.',
  start:
    'Verify your identity so you can publish campaigns and withdraw what you raise.',
};

/**
 * Says what an unverified identity is holding up, and where to fix it.
 * Renders nothing once the person is verified.
 */
export function IdentityCallout({
  status,
  purpose,
}: {
  status: IdentityStatus;
  purpose: keyof typeof NEEDED;
}) {
  if (status === 'VERIFIED') return null;
  const [text, action] =
    status === 'PENDING'
      ? [
          'We’re checking your identity. We’ll email you when it’s done.',
          'View status',
        ]
      : status === 'REJECTED'
        ? [
            'We couldn’t verify your identity. See what to fix and send it again.',
            'See what to fix',
          ]
        : [NEEDED[purpose], 'Verify your identity'];
  return (
    <div
      className={`identity-callout${status === 'PENDING' ? ' waiting' : status === 'REJECTED' ? ' declined' : ''}`}
    >
      <ShieldCheck size={18} aria-hidden="true" />
      <div>
        <p>{text}</p>
        <Link href="/dashboard/verification">
          {action} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
