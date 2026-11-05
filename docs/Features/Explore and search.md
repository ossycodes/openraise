---
status: shipped
branch: feat/public-campaign-page
pr: 14
shipped: 2026-11-05
type: feature
area: web
milestone: 5
priority: 2
effort: M
tags:
  - feature
---

# Explore and search

Browse campaigns by category, sort by trending / newest / close to goal, and
full-text search (Postgres `tsvector`) over title, story and location.

## Shipped in #14

Category browsing on the public homepage, filtered server-side by the API,
with shareable category URLs. Campaigns list newest first.

## Follow-ups

- [[Full-text search and sorting]]: search over title, story and location;
  trending and close-to-goal sorts.
