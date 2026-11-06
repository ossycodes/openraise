---
status: planned
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

Still to build: user management, featuring campaigns, payout retry and
reconciliation actions, categories and deployment settings.

## Money workspace in review

[[Admin money dashboard]] adds read-only balances, ledger inspection, campaign
wallet views and payment/withdrawal/event reconciliation queues. Operator
resolutions, transfer retry, adjustments and their action workflow are separate
work. Manual identity review already shipped in #39; see [[Identity verification]].
