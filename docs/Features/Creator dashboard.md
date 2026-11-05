---
status: in-progress
branch: feat/creator-dashboard
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

## Still to do (part 2: money)

Wallet balance, donations list and CSV export, payout bank accounts,
withdrawals. Later: campaign updates, KYC status, [[AI story writer]].
