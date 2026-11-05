---
title: Changelog
tags:
  - changelog
---

# Changelog

Merged to `main`. Newest first. Older entries identify branches from before
the GitHub remote was configured.

| Branch | Change |
|---|---|
| [#5](https://github.com/ossycodes/openraise/pull/5) · `feat/contributor-guide` | Contribution workflow, code of conduct, issue and PR templates, payment/KYC adapter guide, and contribution label guidance ([[Contributor guide]]) |
| `feat/categories` | Category table seeded with 16 categories by migration, public `GET /categories`, admin create and rename, `@Roles()` + `RolesGuard` ([[Categories]]) |
| `feat/email-password-auth` | Prisma 7 + Postgres; sign up, sign in, sign out, refresh-token rotation with reuse detection, email verification, password reset (signs out every device), `GET /users/me`; scrypt hashes; SMTP mail via Mailpit; DB-backed e2e suite in its own database; MinIO swapped for SeaweedFS in docker-compose ([[Email and password auth]]) |
| `feat/fee-engine` | Shared fee maths (`computeDonationFees`, `computeWithdrawal`, round-half-up basis points on BigInt), exact money formatting and parsing, fees configured by env, public `GET /config/fees` ([[Fee engine]]) |
| `feat/dev-environment` | pnpm monorepo (`apps/api` NestJS 12, `apps/web` Next.js 16, `packages/shared`), docker-compose with Postgres, Redis, MinIO and Mailpit, env validation with zod, `GET /health`, Vitest + oxlint + CI workflow, AGPL-3.0 `LICENSE`, README ([[Dev environment]]) |
| — | 2026-11-05: docs vault, roadmap and research set up on `main` |
