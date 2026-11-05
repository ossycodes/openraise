---
title: Changelog
tags:
  - changelog
---

# Changelog

Merged to `main` on [GitHub](https://github.com/ossycodes/openraise). Newest first.

| PR | Change |
|---|---|
| #11 | Signed payment webhook intake, durable event deduplication and outbox recovery, BullMQ jobs, atomic donation/ledger settlement, and campaign progress backed by committed postings ([[Payment webhooks]]) |
| #10 | Donation fee quotes, idempotent hosted checkout for guests and signed-in donors, immutable fee snapshots and private status reads; ambiguous writes require reconciliation ([[Donation checkout]]) |
| #9 | Double-entry ledger: accounts for provider clearing, campaign wallets, pending payouts, platform revenue and donor fees; balanced, atomic, idempotent postings; balances summed from entries; database integrity check; `donationEntries()` ([[Ledger]]) |
| #8 | Paystack and Bachs payment adapters, validated opt-in configuration, exact amount conversion, signed event parsing and provider contract tests; live sandbox validation remains before enabling payments ([[Payment providers]]) |
| #7 | Campaign images: presigned uploads straight to S3-compatible storage, checked by real size and file signature (JPEG, PNG, WebP, ≤ 5 MB) before attaching; up to 10 per campaign, reorder, delete, first is the cover; `StorageService`; CI runs SeaweedFS ([[Campaign images]]) |
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
