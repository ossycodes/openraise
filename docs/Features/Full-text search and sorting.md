---
status: shipped
branch: feat/campaign-search
pr: 16
shipped: 2026-11-05
type: feature
area: web
milestone: 5
priority: 2
effort: M
tags:
  - feature
---

# Full-text search and sorting

Follow-up to [[Explore and search]].

- Search active campaigns by title, summary, story and location with Postgres
  full-text search (`tsvector` with a GIN index, `websearch_to_tsquery` so
  people can type naturally). `GET /campaigns?q=` plus a search box.
- Sorts: newest (today's default), trending (recent donations weighted by
  recency), close to goal (highest raised / goal among unfinished campaigns).
- Search and sort survive in the URL so results can be shared.
