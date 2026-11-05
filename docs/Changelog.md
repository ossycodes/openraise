---
title: Changelog
tags:
  - changelog
---

# Changelog

Merged to `main`. Newest first. No GitHub remote yet, so rows name the branch
instead of a PR number.

| Branch | Change |
|---|---|
| `feat/fee-engine` | Shared fee maths (`computeDonationFees`, `computeWithdrawal`, round-half-up basis points on BigInt), exact money formatting and parsing, fees configured by env, public `GET /config/fees` ([[Fee engine]]) |
| `feat/dev-environment` | pnpm monorepo (`apps/api` NestJS 12, `apps/web` Next.js 16, `packages/shared`), docker-compose with Postgres, Redis, MinIO and Mailpit, env validation with zod, `GET /health`, Vitest + oxlint + CI workflow, AGPL-3.0 `LICENSE`, README ([[Dev environment]]) |
| — | 2026-11-05: docs vault, roadmap and research set up on `main` |
