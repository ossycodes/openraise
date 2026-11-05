---
title: Decisions
tags:
  - decisions
aliases:
  - ADR
---

# Decisions

Short records of choices that would surprise a newcomer. Add new ones at the bottom.

## Feature parity, own brand
OpenRaise matches what the Nigerian platforms do (see
[[Competitive research 2026-11]]) but uses its own name, copy and design. No
text, images or UI are copied from Gathr, Crowdr or anyone else. That keeps the
project safe to publish and lets anyone deploy it under their own brand.

## AGPL-3.0
Anyone running a modified OpenRaise as a public service must publish their
changes. MIT would let a company take the code closed; for a platform that
handles donations, keeping forks open is part of the trust story.

## NestJS API + Next.js web in one monorepo
A separate API keeps payment and ledger logic in one place, gives future mobile
apps a clean API, and keeps the web app free of secrets. pnpm workspaces share
types and fee maths through `packages/shared` so the donate form and the API
can never disagree on a fee.

## Money as BigInt minor units
Amounts are integers in kobo/pesewas/cents (`BigInt` in Prisma and TS), always
paired with a currency code. Floats can't represent ₦0.10 exactly, and a
rounding error in a donations ledger is a trust problem, not a cosmetic one.

## Double-entry ledger
Every money movement is a set of `LedgerEntry` rows that sum to zero.
Wallet balances are computed from entries, never stored as a mutable number, so
any balance can be audited and rebuilt, and a bug can't silently create money.

## Pluggable providers
Payments, KYC, AI, storage and email sit behind interfaces chosen by env
config. Self-hosters in Ghana or Kenya need different providers than a Lagos
deployment, and no single Nigerian provider is safe to depend on alone.
Paystack and Bachs ship first.

## Webhooks are the source of truth
A donation is only paid when a signature-verified webhook (or a server-side
verify call) says so, never because the donor landed on the success URL.
Webhooks are stored raw, deduplicated on the provider's event id, and processed
idempotently, because providers deliver at least once and out of order.

## Configurable fees
Platform fee, donor processing fee, flat fee and its threshold, and withdrawal
fee are deployment config. A church running its own instance might charge 0%;
a startup might charge 3.5%.

## TypeScript pinned to 6
`pnpm add typescript` now installs TypeScript 7 (the native Go port). The Nest
CLI compiles through the TypeScript JS API, and the Nest 12 + Prisma 7 stack is
proven on 6 (tidepool runs it). Revisit when Nest documents TS 7 support.

## Branch per feature, recorded in the vault
Each feature is built on `feat/<name>` and merged into `main` with a merge
commit once lint, typecheck, tests and build all exit 0. Until the repo has a
GitHub remote there are no PR numbers, so feature notes record `branch`
instead of `pr`.

## Fee rounding
Percentage fees round half up to the nearest minor unit (₦1.505 → ₦1.51),
always on BigInts. The platform fee comes out of the donation; if the donor
ticks "cover the fee" it's added to their charge instead and the campaign gets
the full amount. The donor processing fee is then charged on everything sent
to the processor before it (donation + covered platform fee), because that's
what the processor charges on. Invariant, tested:
`totalCharged = netToCampaign + platformFee + donorFee`.

## All fees are public
`GET /config/fees` publishes every fee, including the withdrawal fee, with no
auth. Hidden withdrawal fees were a gap in the competitors we studied; being
open about money is the product.
