---
status: shipped
branch: feat/admin-operations
pr: 64
shipped: 2026-11-13
type: feature
area: web
milestone: 5
priority: 2
effort: L
tags:
  - feature
---

# Admin console

Review queue, reports, users and KYC, campaigns (feature, pause, end), payouts
(freeze, retry), ledger views and reconciliation, categories, deployment
settings, audit log.

## Done so far

- Campaign review queue (#32): see [[Campaign review queue]].
- Reports & moderation (#34): see [[Reports and flags]].

## Admin operations (#64)

- Searchable user list/detail, role changes and session revocation. Self access
  changes are refused; concurrent demotions preserve an administrator.
- Featured campaigns and reasoned pause/resume/end, payout freeze/unfreeze,
  with version checks and an audit trail.
- Category creation, names, descriptions and order, with stable public slugs.
- Editable branding and prospective fees persisted in shared settings. Existing
  money records retain their snapshots; public config and new emails use the
  saved branding.
- Provider-backed donation and payout verification; replay of stored verified
  events; one linked retry for a confirmed returned payout, using all existing
  withdrawal eligibility and ledger checks.
- Admin browser forms, API documentation, migration and integration coverage.

See [[Admin operations]] for setup, permissions, money safeguards, limitations
and evidence. Merged in #64 on 2026-11-13 with all CI checks passing.
Credentialed payment-provider sandbox validation is still outstanding.

## Money workspace

[[Admin money dashboard]] shipped inspection in #44. This follow-up adds
explicit, reasoned reconciliation actions to the record detail page. General
ledger adjustments and manual financial overrides remain outside the scope.
