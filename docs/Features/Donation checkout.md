---
status: in-progress
branch: feat/donation-checkout
type: feature
area: donations
milestone: 2
priority: 1
effort: M
tags:
  - feature
---

# Donation checkout

Donor (guest or signed in) chooses an amount, sees the fee breakdown from the
[[Fee engine]], optionally covers the platform fee, and is sent to the
provider's hosted checkout. A `Donation` is created `PENDING` with an
idempotency key; it becomes `SUCCEEDED` only via [[Payment webhooks]].
Abandoned and failed payments are marked so they don't count.

## Implemented on this branch

API quote, idempotent hosted checkout creation and capability-protected status
reads. Fees are calculated server-side and saved before provider I/O. Guest and
authenticated donors are supported; see [[API#Donation checkout]]. The campaign
page/donate UI is part of the later web milestone.

Concurrent retries never create a second provider request. Ambiguous writes
remain pending with `checkoutState: UNCERTAIN` and need reconciliation, including
an initialization interrupted by a process crash. They are never automatically
retried. Redirects only navigate back to the campaign. Paid/failed/expired payment
transitions arrive with [[Payment webhooks]]; this branch only marks definite
checkout-creation rejections failed. Tests use a fake hosted checkout adapter
against the real migrated database; no live provider account was charged.
