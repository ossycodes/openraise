---
status: shipped
pr: 30
shipped: 2026-11-06
branch: feat/campaign-updates
type: feature
area: growth
milestone: 6
priority: 2
effort: M
tags:
  - feature
---

# Campaign updates

Creators post updates (text + images) on the campaign page. Donors who opted in
get them by email. Updates are the main way to show where the money went.

## Implementation

- Verified organisers publish plain text and up to three validated photos from
  the campaign dashboard's Updates tab; approved, paused and ended campaigns
  are supported.
- Public campaign pages have a dated, paginated organiser timeline, with empty
  and unavailable states. Posts can be removed by their owner or an admin;
  history is retained. Published text is not editable.
- Checkout asks separately for update emails, unchecked by default. Paid,
  ledger-backed opt-ins receive future updates through the durable notification
  outbox. One campaign/email subscription prevents repeated donations creating
  duplicate emails. Names/messages shipped separately in #29; see [[Donor messages and anonymous giving]].
- Unsubscribe requires an explicit confirmation; queued sends are cancelled,
  already-sending messages may complete. Receipt emails are unaffected.
- Screenshots and checks: `output/campaign-updates/verification.md`.

## Operations and limits

The API runs a five-second durable fan-out poller; the existing notification
worker sends its resulting outbox entries. No separate service or external mail
integration is required. See [[Receipt delivery]] for retries and uncertain
SMTP review. Database migration must run before the new API starts.

Update mail uses the configured SMTP adapter and deployment branding. Browser
review uses fictional loopback fixtures, and automated email checks use the fake
mail adapter; external inbox placement has not been tested. Existing subscribers
are never inferred from past donations. Unused upload cleanup remains planned.
