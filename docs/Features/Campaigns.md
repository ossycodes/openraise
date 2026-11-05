---
status: shipped
type: feature
area: campaigns
milestone: 1
priority: 1
effort: L
branch: feat/campaigns
pr: 6
shipped: 2026-11-05
tags:
  - feature
---

# Campaigns

Create, edit and publish a campaign: title, slug, category, goal amount and
currency, optional end date, beneficiary name, location, story. Images are
[[Campaign images]].

Only the owner (or an organisation member, see [[Organisations]]) can edit.
Publishing requires a verified email now, and a verified identity once
[[Identity verification]] ships.

Public read endpoints: by slug, list with filters (category, featured) and
pagination. Raised amount and donor count come from the [[Ledger]].

## Lifecycle

```
DRAFT ──submit──▶ PENDING_REVIEW ──approve──▶ ACTIVE ⇄ PAUSED ──end──▶ ENDED
                       │ reject
                       ▼
                   REJECTED ──(edit, submit)──▶ PENDING_REVIEW
```

| Action | Who | From | To |
|---|---|---|---|
| submit | Owner, verified email | `DRAFT`, `REJECTED` | `PENDING_REVIEW` |
| approve | Admin | `PENDING_REVIEW` | `ACTIVE` |
| reject (with reason) | Admin | `PENDING_REVIEW` | `REJECTED` |
| pause / resume | Owner | `ACTIVE` / `PAUSED` | `PAUSED` / `ACTIVE` |
| end | Owner | `ACTIVE`, `PAUSED` | `ENDED` |

`ACTIVE`, `PAUSED` and `ENDED` are public; the rest are owner and admin only.

## As built

- Endpoints: [[API#Campaigns]]. Table: [[Data model#Campaign]].
- One transition table (`campaign-status.ts`); each change is a conditional
  update, so racing approve/reject can't both win.
- Slugs and the 404 rule: [[Decisions#Campaign slugs: title plus a random suffix]],
  [[Decisions#404, not 403, for campaigns you can't see]].
- Editing: [[Decisions#Review locks editing; live edits don't need re-review]].
- Not yet: auto-ending when `endsAt` passes (needs the job queue; arrives with
  donations), the admin review list ([[Campaign review queue]]), featuring
  campaigns ([[Admin console]]), images ([[Campaign images]]).
