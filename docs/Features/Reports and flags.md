---
status: in-progress
branch: feat/campaign-reports
type: feature
area: trust
milestone: 4
priority: 2
effort: S
tags:
  - feature
---

# Reports and flags

Anyone can report a campaign (fraud, misleading, offensive) with a reason.
Reports reach the admin console; admins can pause the campaign and freeze
payouts while they investigate.

## Implementation

A private reporting form on public campaign pages accepts a category and
20–2,000 characters of detail, without an account or email. UUID request keys
make retries idempotent. Reports do not automatically change campaign state.
No public/organiser report reads or reporter contact fields are introduced.

The admin workspace has a Reports & moderation tab, oldest-first searchable
queue, status filters, campaign context and reasoned action history. Actions:
pause donations, lift the admin pause, freeze/unfreeze payouts, resolve or
dismiss. Report and campaign version checks refuse stale actions; current admin
roles are checked by the API. Administrators cannot moderate their own campaign.

A moderation pause blocks creator resume in the API and explains the restriction
in the creator dashboard. Lifting it leaves the campaign paused until its owner
resumes. Resolution/dismissal never silently releases restrictions. Freeze
operations use the existing payout-freeze audit and campaign reservation lock;
already-held or dispatched transfers are unaffected.

No attachments, report email notifications, appeals or automatic fraud decisions.
General rate limiting remains [[Rate limiting]]; request idempotency prevents
accidental duplication, not intentional spam. Screenshots and checks are in
`output/campaign-reports/verification.md`.
