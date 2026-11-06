---
status: shipped
branch: feat/creator-dashboard, feat/creator-money
pr: 26
shipped: 2026-11-06
type: feature
area: web
milestone: 5
priority: 2
effort: L
tags:
  - feature
---

# Creator dashboard

My campaigns, campaign editor (with [[AI story writer]]), donations list and
CSV export, post an update, wallet balance, bank account, withdraw, KYC status.

## Done (part 1: campaigns)

- `/dashboard`: every campaign you own with status, progress and supporters.
- `/dashboard/campaigns/new`: create a draft (title, category, currency, goal,
  end date, summary, story, beneficiary, location, YouTube video).
- `/dashboard/campaigns/:id`: edit, photos (upload, choose the cover, remove),
  submit for review with the API's missing-field list, pause, resume, end,
  delete a draft; rejection reasons shown.
- Signed-in sessions refresh themselves in `proxy.ts`; see
  [[Decisions#Web sessions: two httpOnly cookies, refreshed in proxy.ts]].

## Done (part 2: money)

- `/dashboard/campaigns/:id/money`: available balance, raised, platform fees,
  withdrawals on their way and paid out; confirmed donations (25 a page) with a
  CSV download; withdrawal history; withdraw with a fee review step and one
  idempotency key per reviewed quote.
- `/dashboard/payouts`: add a payout account (name looked up with the bank,
  confirmed before saving), choose the default, remove.
- New owner-only API reads: see [[API#Creator money]].

## Not here

Campaign updates ([[Campaign updates]]), KYC status ([[Identity verification]])
and the [[AI story writer]] have their own notes. Donor names on the donations
list come with [[Donor messages and anonymous giving]].
