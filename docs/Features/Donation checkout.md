---
status: planned
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
