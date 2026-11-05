---
status: shipped
shipped: 2026-11-05
branch: feat/payment-webhooks
pr: 11
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

## Implemented on this branch

- `POST /webhooks/:provider` accepts only the configured adapter. Signature
  verification uses the exact raw body. Unsupported signed events are retained
  as ignored; malformed or invalidly signed events are 400, unknown/disabled
  providers 404. Accepted events return 202 without waiting for settlement.
- `PaymentEvent` stores original bytes, normalized processing fields and a
  unique `(provider, eventId)`. Duplicate delivery reuses the first immutable
  payload. Queue jobs contain only the database event ID, never donor details.
- PostgreSQL is the durable outbox. Failed enqueue returns 503 after retaining
  the event; a five-second recovery scan also requeues pending rows after a
  crash, failed job or Redis loss. BullMQ retries failed jobs five times with
  exponential backoff. Recovery keeps retrying rows still pending afterward.
- Workers lock both event and donation rows. Donation success, the existing
  ledger's balanced posting and marking the event processed share one database
  transaction. `LedgerService.postInTransaction` exposes that boundary. A
  database check prevents success without a ledger transaction link; a trigger
  protects the checkout's monetary snapshot against later mutation.
- Money and provider/reference must match the saved donation. Older events are
  ignored, success is terminal, and a newer successful attempt can follow a
  failed attempt. An additional successful charge for an already-paid donation
  is retained as rejected for manual reconciliation, never credited twice.
- Source event time uses Bachs `created_at` or Paystack `paid_at`/`created_at`,
  falling back to the first receipt time when absent. Signature freshness is
  checked at intake, not again after time spent in the queue.
- Failed and expired payments never contribute to campaign totals. Public
  raised amounts use gross donations linked to committed donation postings;
  donor count is distinct normalized donor emails. Wallet balances remain net
  funds derived by the existing ledger. Receipts are still [[Donor receipts]].

## Operation and scope

Set `REDIS_URL` (default `redis://localhost:6379`) and a unique
`PAYMENT_QUEUE_PREFIX` for each deployment/database sharing Redis. Workers start
with the API only when payments are configured. Shut down with the normal Nest
shutdown hooks. CI includes Redis, and the e2e suite exercises a real BullMQ
worker plus recovery of a stored event after a simulated enqueue failure.

Monitor `PaymentEvent` rows with null `processedAt` and rows whose `outcome` is
`REJECTED`; they indicate pending retries or required reconciliation. Raw events
can contain personal/payment information: keep database access restricted and
exclude them from logs and public APIs. No public event browsing endpoint exists.

Payout/refund events are retained but ignored until their business workflows
ship ([[Withdrawals]]); this feature only settles donations. Provider sandbox
verification remains required before enabling payments. There is no automatic
provider polling/reconciliation scheduler yet: a missing webhook or checkout
initialization interrupted by a crash must be reconciled before retrying a charge.
