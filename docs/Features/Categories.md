---
status: shipped
type: feature
area: campaigns
milestone: 1
priority: 1
effort: S
branch: feat/categories
shipped: 2026-11-05
tags:
  - feature
---

# Categories

Seeded, admin-editable list: Animals, Business, Community, Competitions,
Creative, Education, Emergencies, Environment, Family, Funerals & memorials,
Medical, Newlyweds, Sports, Travel, Volunteer, Other. Each has a slug, name,
description and sort order.

## As built

- Seeded by migration with our own one-line descriptions:
  [[Decisions#Seed data lives in migrations]].
- `GET /categories`, `GET /categories/:slug` public; `POST` and `PATCH` for
  admins ([[API#Categories]]). Slugs are fixed once created.
- Added `@Roles()` + `RolesGuard` for admin routes:
  [[Decisions#Roles come from the database, not the token]].
- No delete yet: campaigns will reference categories, so removal needs a
  "move campaigns to…" step. Revisit in the [[Admin console]].
