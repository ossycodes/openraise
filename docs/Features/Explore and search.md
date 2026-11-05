---
status: in-progress
branch: feat/public-campaign-page
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

## Current progress

Category browsing is implemented on the public homepage using server-side API filtering and shareable category URLs. Full-text search and additional sorting options remain pending.
