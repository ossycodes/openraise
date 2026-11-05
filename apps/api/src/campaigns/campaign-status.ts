import type { CampaignStatus } from '../generated/prisma/client.js';

/**
 * The campaign lifecycle. Every status change goes through one of these
 * actions; anything not listed here is refused.
 *
 *   DRAFT ──submit──▶ PENDING_REVIEW ──approve──▶ ACTIVE ⇄ PAUSED ──end──▶ ENDED
 *     ▲                     │                        └────────end────────▲
 *     └──(edit)── REJECTED ◀┘ reject
 *                    └──submit──▶ PENDING_REVIEW
 */
export type CampaignAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'pause'
  | 'resume'
  | 'end';

export const TRANSITIONS: Record<
  CampaignAction,
  { from: readonly CampaignStatus[]; to: CampaignStatus }
> = {
  submit: { from: ['DRAFT', 'REJECTED'], to: 'PENDING_REVIEW' },
  approve: { from: ['PENDING_REVIEW'], to: 'ACTIVE' },
  reject: { from: ['PENDING_REVIEW'], to: 'REJECTED' },
  pause: { from: ['ACTIVE'], to: 'PAUSED' },
  resume: { from: ['PAUSED'], to: 'ACTIVE' },
  end: { from: ['ACTIVE', 'PAUSED'], to: 'ENDED' },
};

/** Where `action` takes a campaign in `status`, or null if it isn't allowed. */
export function nextStatus(
  status: CampaignStatus,
  action: CampaignAction,
): CampaignStatus | null {
  const t = TRANSITIONS[action];
  return t.from.includes(status) ? t.to : null;
}

/** Statuses anyone can see. The rest are visible to the owner and admins only. */
export const PUBLIC_STATUSES: readonly CampaignStatus[] = [
  'ACTIVE',
  'PAUSED',
  'ENDED',
];

/**
 * Statuses the owner can edit in. Not while an admin is reviewing it, and
 * not once it has ended.
 */
export const EDITABLE_STATUSES: readonly CampaignStatus[] = [
  'DRAFT',
  'REJECTED',
  'ACTIVE',
  'PAUSED',
];

/** The currency can only change before the campaign is first submitted. */
export const CURRENCY_EDITABLE_STATUSES: readonly CampaignStatus[] = [
  'DRAFT',
  'REJECTED',
];
