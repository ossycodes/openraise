---
status: in-progress
branch: feat/donor-receipts
pr: 13
type: feature
area: donations
milestone: 2
priority: 2
effort: S
tags:
  - feature
---

# Donor receipts

Email receipt after a successful donation with amount, fees, campaign and a
reference. The creator gets a "new donation" notification (batched if busy).

## Implementation

- Verified settlement schedules one donor receipt and one creator-notification
  item per donation in the same transaction as donation state and ledger posting.
  A duplicate payment event cannot schedule another receipt. Pending, failed,
  expired and rejected payments produce no notification.
- The receipt snapshots the donor recipient, campaign title/link, reference,
  confirmed time and original amount/fee breakdown. Text and HTML use exact money
  formatting and escape campaign content. No checkout/status capability is emailed.
- Creator notifications group donations for one campaign in one-minute windows.
  The summary reports count and gross amount without donor names or emails.
  Once a batch is claimed, its content is frozen; late arrivals use a new delivery.
- A PostgreSQL notification outbox survives restart without depending on Redis.
  Two worker lanes claim due rows with row locks and `SKIP LOCKED`, every five
  seconds. Email I/O takes place outside database transactions.
- Known temporary SMTP non-acceptance retries with exponential backoff from one
  minute, up to five attempts. Permanent rejection/exhausted retries are `FAILED`.
  Every attempt uses a stable Message-ID. Normal retries never replay a `SENT` row.
- SMTP is not an exactly-once transport. Unknown outcomes and sends interrupted
  after claiming are held as `UNCERTAIN`, not automatically retried. A lost DB
  acknowledgement after SMTP acceptance follows the same rule. See
  [[Receipt delivery]] for operator reconciliation.

No new HTTP endpoints or user-facing resend control. Existing `SMTP_URL`,
`MAIL_FROM` and `WEB_URL` configure delivery. The worker runs with the API, even
when payment checkout is disabled, so previously scheduled receipts can finish.
Historical successful donations from before this feature are not automatically
backfilled. Tests use fake mail plus a local SMTP server fixture; no external
email delivery is exercised.
