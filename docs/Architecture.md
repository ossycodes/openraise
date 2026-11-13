---
title: Architecture
tags:
  - architecture
---

# Architecture

## Layout

```
.
├── apps/
│   ├── api/        NestJS 12 REST API (Prisma + PostgreSQL, Redis + BullMQ for jobs)
│   └── web/        Next.js 16 (App Router, React 19): public site, creator dashboard, admin
├── packages/
│   └── shared/     Types, zod schemas, money + fee maths used by api and web
├── docker-compose.yml   Postgres, Redis, SeaweedFS (S3-compatible storage), Mailpit (dev email)
└── docs/           This vault
```

pnpm workspaces (`pnpm -r` runs scripts in dependency order; no Turborepo
yet). Node 22, TypeScript 6, Vitest, oxlint. `packages/shared` is compiled to
`dist/` and consumed by both apps, so build it first (`pnpm build:shared`;
`pnpm dev` does it for you). See [[Local development]].

## Modules (API)

| Module | Owns |
|---|---|
| `auth` | Sign-up, sign-in, JWT access + refresh tokens, email verification, password reset |
| `users` | Profiles, roles |
| `organisations` | NGO accounts, members, roles |
| `campaigns` | Campaign CRUD, media, status workflow, categories, search |
| `updates` | Creator posts to donors |
| `donations` | Checkout, donor messages, receipts, recurring schedules |
| `payments` | `PaymentProvider` interface + adapters (Paystack, Bachs), webhook ingestion |
| `ledger` | Double-entry postings, wallet balances |
| `payouts` | Bank accounts, account-name resolution, withdrawals |
| `kyc` | `KycProvider` interface + adapters (QoreID, Dojah, Smile ID) |
| `ai` | `AiProvider` interface: story writer, social posts |
| `notifications` | Email (SMTP / Resend), templates |
| `admin` | Review queue, reports, payout controls, audit log |

## Main flows

### Donation

1. Donor picks an amount on the campaign page. The API computes fees with the
   shared fee engine and creates a `Donation` in `PENDING`.
2. The active `PaymentProvider` creates a hosted checkout (Paystack
   `transaction/initialize`, Bachs `POST /v1/checkout-sessions` with `pricing`).
   Our donation id goes in the provider reference / metadata.
3. Donor pays on the provider's page and is sent back to the campaign.
4. The provider's webhook arrives. We verify the signature on the raw body,
   store it in `PaymentEvent` (unique on provider + event id), and process it
   in a job.
5. Processing re-checks the amount and currency against the `Donation`, marks it
   `SUCCEEDED`, and posts ledger entries: donor payment in, platform fee to the
   platform account, net amount to the campaign wallet. Receipt email goes out.

The redirect back from checkout never marks a donation paid; only the verified
webhook (or a server-side verify call) does.

### Withdrawal

1. Creator adds a bank account. We resolve the account name with the provider
   and require it to match the verified KYC name.
2. Creator requests a withdrawal up to the wallet's available balance. The API
   posts a hold in the ledger (wallet → pending payouts) and creates the payout
   with an idempotency key.
3. `payout.paid` / `transfer.success` settles the hold; `payout.failed` reverses it.

## Money

- Amounts are `BigInt` minor units with an ISO currency code beside them.
- The [[Decisions#Double-entry ledger|ledger]] is the only source of balances.
- Fees come from deployment config (`PLATFORM_FEE_BPS`, `DONOR_FEE_BPS`,
  `DONOR_FLAT_FEE`, `DONOR_FLAT_FEE_THRESHOLD`, `WITHDRAWAL_FEE`), so each
  deployment sets its own pricing.

## Providers

| Interface | Shipped adapters | Selected by |
|---|---|---|
| `PaymentProvider` | Paystack, Bachs | `PAYMENT_PROVIDER` |
| `KycProvider` | QoreID, Dojah, Smile ID, `manual` | `KYC_PROVIDER` |
| `AiProvider` | Anthropic, OpenAI-compatible | `AI_PROVIDER` |
| `StorageProvider` | S3-compatible (SeaweedFS, R2, S3) | `STORAGE_*` |
| `MailProvider` | SMTP, Resend | `MAIL_PROVIDER` |

### Bachs notes

- Base URLs: `https://sandbox-api.bachs.io`, live API host from their docs. Auth
  `Authorization: Bearer sk_sandbox_…` / `sk_live_…`.
- Checkout: `POST /v1/checkout-sessions` with `pricing: { amount, currency }`
  (no product needed), `metadata`, `success_url`, `cancel_url`, `reference`.
  Send an `Idempotency-Key`.
- Webhooks: verify `X-Bachs-Signature-V2` (`t=…,v1=…`, HMAC-SHA256 of
  `"{t}.{raw_body}"`, accept any `v1`, 300 s tolerance). Deduplicate on event
  `id`. Return 5xx on our own failure so Bachs retries.
- Events we use: `collection.succeeded`, `collection.failed`,
  `checkout.expired`, `refund.*`, `payout.paid`, `payout.failed`.
- Payouts: `POST /v1/payouts/destinations`, `POST /v1/payouts`, banks via List
  Banks (`country=NG`).
- OpenRaise's Bachs NGN checkout floor is ₦1,000 (a conservative application policy); the donate form enforces it when Bachs is
  active.

## Milestones

| # | Milestone | Contents |
|---|---|---|
| 1 | Foundation | Monorepo, dev environment, schema, auth, campaigns, categories, fee engine |
| 2 | Donations | Payment providers, checkout, webhooks, ledger, receipts, donor messages |
| 3 | Payouts | Bank accounts, wallets, withdrawals |
| 4 | Trust & safety | KYC, review queue, reports, audit log |
| 5 | Web app | Landing, explore, campaign page, donate flow, dashboard, admin |
| 6 | Growth | AI story writer and social posts, updates, share kit, SEO pages |
| 7 | Parity extras | Recurring, multi-currency, organisations, volunteers, matching |
| 8 | Ops | Rate limiting, observability, deploy, contributor guide |

Each feature is a note in `Features/` with a `milestone` property; see
[[Tracker.base|the tracker]].


### Vendor identity checks

Manual document review remains the default. QoreID and Dojah verify Nigerian
NIN/BVN records with selfie match. Smile ID v3 Enhanced KYC verifies records
asynchronously without biometrics. Vendor checks require explicit consent;
Smile also needs the deployment's HTTPS privacy notice and callback URLs.
The service reserves the pending row before dispatch and retains uncertain
outcomes for reconciliation. See [[KYC vendors]] for provider setup and limits.
