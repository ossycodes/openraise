---
status: shipped
pr: 48
shipped: 2026-11-06
branch: feat/audit-log
type: feature
area: trust
milestone: 4
priority: 2
effort: S
tags:
  - feature
---

# Audit log

Append-only record of sensitive actions: admin decisions, payout freezes,
bank-account changes, KYC overrides, role changes. Who, what, when, before and
after.

## Implementation

Admin-only `/admin/audit`: exact ID, action and UTC-day filters, 25 events per
page, dated actor/target/subject references and expandable redacted before/after
states. No-store API reads and no mutation or export controls.

Database triggers record actual changes to campaign status/restrictions, report
outcomes, identity decisions, bank-account addition/default/removal and account
roles. Authenticated workflows set transaction-local actor context; direct
maintenance without it is explicitly unattributed. A failed transaction creates
no event. Ordinary audit updates, deletes and truncation are rejected.

Coverage starts when the migration is installed. Existing decision reasons and
operational records remain in place; no historical backfill is fabricated. Role
management and automated KYC adapters are separate roadmap work. Bank numbers,
names, ID details, notes, documents and credentials never enter these snapshots.
A privileged database owner can disable triggers, so this is not an external
immutable archive. See `output/audit-log/verification.md` for test evidence.
