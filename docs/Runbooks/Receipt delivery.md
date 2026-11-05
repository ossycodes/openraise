---
title: Receipt delivery
tags:
  - runbook
  - notifications
---

# Receipt delivery

The API runs a notification worker every five seconds. It reads PostgreSQL
outbox rows directly; Redis is not required for mail delivery. `SMTP_URL`,
`MAIL_FROM` and `WEB_URL` are the existing settings. Restarting the API recovers
due pending rows. Graceful shutdown waits for active sends; SMTP connection,
greeting and socket timeouts bound normal transport operations.

## Outcomes

| State | Meaning | Automatic behavior |
|---|---|---|
| `PENDING` | Waiting for its scheduled send/retry | Claimed when due |
| `SENDING` | Claimed; the SMTP outcome may not be known | Never claimed again; after five minutes becomes uncertain |
| `SENT` | SMTP server accepted the message and that result was recorded | Never resent |
| `UNCERTAIN` | Interrupted/ambiguous attempt, possibly accepted | Held for investigation |
| `FAILED` | Permanent rejection, invalid source or exhausted retries | Held until the problem is fixed |

A stable `<delivery-id@receipts.openraise.local>` Message-ID identifies every
attempt. SMTP servers can replace Message-IDs; use the transport's trace when
that happens. Acceptance does not guarantee inbox delivery. The adapter avoids
logging upstream error text, recipient addresses or full message bodies.

## Investigate a held delivery

Use authorized database and SMTP-server access. Inspect the delivery ID, state,
attempt count and `lastError`; the row's content/recipient is private. Locate the
attempt in the SMTP server's records using its Message-ID and sending time.

- If acceptance is confirmed, record `SENT` with the confirmed send time. Do not
  send another copy.
- If non-acceptance is confirmed, correct the underlying configuration or address
  problem, then requeue that same delivery as `PENDING` with a due `nextAttemptAt`.
  Reset its attempts only when deliberately restarting an exhausted retry cycle.
  Keep the existing content and ID; this preserves the receipt and trace.
- If the result remains unknown, leave it `UNCERTAIN`. A blind resend can create
  a duplicate receipt.

No public resend API is available. Do not modify donation/payment/ledger state
while reconciling email. A mail outage must not change an already-settled payment.

## Creator batching and deployment

Creator notifications share a campaign/minute bucket and wait until its end.
The sender freezes the aggregate count and amount before SMTP. Notifications
arriving after that batch was claimed use a new delivery, including when the
first batch is waiting to retry. Donor identities do not appear in the summary.

Apply migrations before starting the new API. Only settlements processed by this
feature schedule notifications; existing historical successes are not bulk emailed.
Tests override the worker unless explicitly testing background processing, and a
local SMTP fixture exercises acceptance, rejection and connection loss without
sending external email.

SMTP response semantics follow [Nodemailer's error documentation](https://nodemailer.com/errors/).
