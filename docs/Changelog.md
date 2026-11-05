---
title: Changelog
tags:
  - changelog
---

# Changelog

Merged to `main` on [GitHub](https://github.com/ossycodes/openraise). Newest first.

| PR | Change |
|---|---|
| #6 | Campaigns: drafts, submit for review, admin approve/reject with a reason, pause/resume/end, public list and detail by slug; one transition table with conditional updates; 404 for campaigns you can't see ([[Campaigns]]) |
| #5 | Contribution workflow, code of conduct, issue and PR templates, payment/KYC adapter guide, and contribution label guidance ([[Contributor guide]]) |
| #4 | Category table seeded with 16 categories by migration, public `GET /categories`, admin create and rename, `@Roles()` + `RolesGuard` ([[Categories]]) |
| #3 | Prisma 7 + Postgres; sign up, sign in, sign out, refresh-token rotation with reuse detection, email verification, password reset (signs out every device), `GET /users/me`; scrypt hashes; SMTP mail via Mailpit; DB-backed e2e suite in its own database; MinIO swapped for SeaweedFS in docker-compose ([[Email and password auth]]) |
| #2 | Shared fee maths (`computeDonationFees`, `computeWithdrawal`, round-half-up basis points on BigInt), exact money formatting and parsing, fees configured by env, public `GET /config/fees` ([[Fee engine]]) |
| #1 | pnpm monorepo (`apps/api` NestJS 12, `apps/web` Next.js 16, `packages/shared`), docker-compose, env validation with zod, `GET /health`, Vitest + oxlint + CI workflow, AGPL-3.0 `LICENSE`, README ([[Dev environment]]) |
| — | 2026-11-05: docs vault, roadmap and research set up on `main` |

PRs #1–#4 were built and merged locally first, then pushed and merged on
GitHub on 2026-11-05 (CI needed `packageManager` pinned and the Prisma client
generated explicitly).
