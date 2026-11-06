---
status: shipped
pr: 44
shipped: 2026-11-06
branch: feat/admin-money-dashboard
type: feature
area: web
milestone: 5
priority: 2
effort: M
---

# Admin money dashboard

Read-only ledger balances by currency, transaction inspection and a reconciliation
queue for uncertain payments, withdrawals and rejected/stalled webhook events.
Part of the broader [[Admin console]]. Financial actions and operator resolutions
remain a separate feature; this view never resends money or alters settlement.

## Implementation

- `/admin/money`: normal-sign account balances per currency, posting counts,
  ledger integrity checks and separate queue counts.
- `/admin/money/ledger`: paginated search by reference/description/transaction,
  currency, type and campaign. Campaign filters show wallet balances derived from
  postings, including withdrawal reservations. Posting detail shows every signed
  entry, balance checks and related donation/withdrawal records.
- `/admin/money/reconciliation`: separate withdrawal, checkout and provider-event
  queues, followed by private record inspection. Amount breakdowns, provider IDs,
  posting links, masked withdrawal destination and recent payout-freeze history.
- Shared withdrawal queue thresholds; no provider calls, replay, resolution,
  transfer retry, balance adjustment or new ledger movement is introduced.

Reads require the current ADMIN role. Donor email/name/message, payment URLs,
idempotency hashes, raw webhook bytes, full bank numbers and payout-recipient
identifiers are excluded. Unknown provider currencies show raw minor units.
Screenshots and checks: `output/admin-money/verification.md`.
