---
status: planned
type: feature
area: payments
milestone: 2
priority: 1
effort: M
tags:
  - feature
---

# Payment webhooks

`POST /webhooks/:provider`. Read the raw body, verify the signature, store the
event in `PaymentEvent` (unique on provider + event id), return 2xx fast, then
process in a BullMQ job. Processing is idempotent, ignores events older than
the stored state, and re-checks amount + currency against the donation. Our own
failures return 5xx so the provider retries.
