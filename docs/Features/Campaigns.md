---
status: planned
type: feature
area: campaigns
milestone: 1
priority: 1
effort: L
tags:
  - feature
---

# Campaigns

Create, edit and publish a campaign: title, slug, category, goal amount and
currency, optional end date, cover image and gallery, beneficiary name,
location, story (rich text).

Status workflow: `DRAFT → PENDING_REVIEW → ACTIVE → PAUSED / ENDED`, or
`REJECTED` with a reason. Only the owner (or an organisation member, see
[[Organisations]]) can edit. Publishing requires a verified creator once
[[Identity verification]] ships.

Public read endpoints: by slug, list with filters (category, status, featured)
and pagination. Raised amount and donor count come from the [[Ledger]].
