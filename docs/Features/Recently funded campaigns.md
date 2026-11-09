---
status: shipped
pr: 53
shipped: 2026-11-09
branch: feat/recently-funded
type: feature
area: web
milestone: 5
priority: 3
effort: S
tags:
  - feature
---

# Recently funded campaigns

Follow-up to [[Landing page]]. A homepage section of campaigns that recently
reached their goal, as social proof that giving here works.

- API: campaigns whose raised amount (from the [[Ledger]]) reached the goal,
  most recent first.
- Homepage section with the date each was funded.

## Implementation

`GET /campaigns/recently-funded?limit=6` (see [[API]]) returns live and ended
campaigns with a derived `fundedAt`; see
[[Decisions#"Funded" is derived from the donations, not stored]]. The homepage
shows a "Recently funded" strip under the campaign directory only when there
is at least one: cover, funded date, raised against goal and supporters. Three
cards on phones, up to six on wider screens.
