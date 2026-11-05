---
title: Data model
tags:
  - data-model
---

# Data model

PostgreSQL via Prisma 7. The schema lives in `apps/api/prisma/schema.prisma`;
migrations in `apps/api/prisma/migrations/`. Every timestamp is `timestamptz`.
IDs are cuids. Money columns (from M2) are `BigInt` minor units with a
currency code beside them; see [[Decisions#Money as BigInt minor units]].

## Campaigns

### Category

| Field | Type | Notes |
|---|---|---|
| `id` | text | Seeded rows use fixed ids (`cat_medical`); new ones are cuids |
| `slug` | text, unique | Used in URLs; can't change after creation |
| `name` | text | |
| `description` | text | One line, shown on category pages |
| `sortOrder` | int | Lower first; "Other" is 999 |
| `createdAt`, `updatedAt` | timestamptz | |

Sixteen categories are inserted by the `categories` migration; see
[[Decisions#Seed data lives in migrations]].

### Campaign

| Field | Type | Notes |
|---|---|---|
| `id` | cuid | Used in write endpoints |
| `slug` | text, unique | `slugified-title-k7m2q`; fixed at creation, used in public URLs |
| `ownerId` | → User | Restrict delete |
| `categoryId` | → Category | Restrict delete |
| `title` | text | 5–100 characters |
| `summary` | text | Up to 200; at least 10 to submit |
| `story` | text | Up to 20,000; at least 100 to submit |
| `goalAmount` | bigint | Minor units of `currency` |
| `currency` | text | `NGN`, `USD`, `GHS` or `KES`; fixed once submitted |
| `beneficiaryName`, `location` | text? | |
| `endsAt` | timestamptz? | Must be in the future when set or submitted |
| `status` | `DRAFT` \| `PENDING_REVIEW` \| `ACTIVE` \| `PAUSED` \| `ENDED` \| `REJECTED` | See [[Campaigns#Lifecycle]] |
| `rejectionReason` | text? | Set on reject, cleared on resubmit |
| `featured` | boolean | Set by admins (console comes later) |
| `submittedAt`, `publishedAt`, `endedAt` | timestamptz? | |
| `createdAt`, `updatedAt` | timestamptz | |

Indexed on `(status, publishedAt)` for the public list, `(categoryId, status)`
and `ownerId`.

### CampaignImage

| Field | Type | Notes |
|---|---|---|
| `id` | cuid | |
| `campaignId` | → Campaign | Cascade delete (the API also deletes the files) |
| `key` | text, unique | Storage key `campaigns/{campaignId}/{random}.{ext}` |
| `contentType` | text | Sniffed from the file's bytes, never taken from the client |
| `size` | int | Bytes, at most 5 MB |
| `position` | int | 0 is the cover; kept contiguous on delete |
| `createdAt` | timestamptz | |

At most 10 per campaign. Indexed on `(campaignId, position)`.

## Ledger

Double-entry bookkeeping; see [[Ledger]]. Entries are never updated or
deleted, and no table stores a balance.

### LedgerAccount

| Field | Type | Notes |
|---|---|---|
| `id` | cuid | |
| `key` | text, unique | `CAMPAIGN_WALLET:NGN:<campaignId>` or `PLATFORM_REVENUE:NGN` |
| `type` | `PROVIDER_CLEARING` \| `CAMPAIGN_WALLET` \| `PENDING_PAYOUTS` \| `PLATFORM_REVENUE` \| `DONOR_FEES` | |
| `currency` | text | One currency per account |
| `campaignId` | → Campaign? | Campaign wallets only; restrict delete |
| `createdAt` | timestamptz | Accounts are created on first posting |

### LedgerTransaction

| Field | Type | Notes |
|---|---|---|
| `id` | cuid | |
| `kind` | `DONATION` \| `WITHDRAWAL_HOLD` \| `WITHDRAWAL_SETTLE` \| `WITHDRAWAL_REVERSE` \| `REFUND` \| `ADJUSTMENT` | |
| `idempotencyKey` | text, unique | One per business event, e.g. `donation:<id>` |
| `currency` | text | Every entry is in this currency |
| `description` | text | Human-readable |
| `createdAt` | timestamptz | |

### LedgerEntry

| Field | Type | Notes |
|---|---|---|
| `id` | cuid | |
| `transactionId` | → LedgerTransaction | Restrict delete |
| `accountId` | → LedgerAccount | Restrict delete |
| `amount` | bigint | Signed minor units: positive = debit, negative = credit |
| `createdAt` | timestamptz | |

A transaction's entries sum to zero. Indexed on `accountId` and
`transactionId`.

## Payouts

### BankAccount

| Field | Type | Notes |
|---|---|---|
| `id` | cuid | |
| `userId` | → User | Restrict delete |
| `country`, `currency` | text | `NG`, `NGN` for now |
| `bankCode`, `bankName` | text | From the provider's bank list |
| `accountNumber` | text | 10-digit NUBAN; API responses show only the last 4 |
| `accountName` | text | Resolved by the provider, never typed by the user |
| `provider`, `recipientId` | text | The provider's payout recipient |
| `recipientUsable` | boolean | False if the provider must approve the recipient first |
| `nameMatchesProfile` | boolean | Two full name parts shared with the user's name |
| `isDefault` | boolean | One per user |
| `payoutsAvailableAt` | timestamptz | Created + 24 h |
| `removedAt` | timestamptz? | Soft delete, kept for withdrawal history |
| `createdAt` | timestamptz | |

Indexed on `(userId, removedAt)`. At most 5 active per user.

## Auth

### User

| Field | Type | Notes |
|---|---|---|
| `id` | cuid | |
| `email` | text, unique | Lower-cased and trimmed before saving |
| `name` | text | Display name, 1–100 characters |
| `passwordHash` | text | `scrypt$N$r$p$salt$hash`; see [[Decisions#scrypt, not argon2]] |
| `role` | `USER` \| `ADMIN` | |
| `emailVerifiedAt` | timestamptz? | Set by the verify link, or by a password reset |
| `tokenVersion` | int | In every access token; incremented to sign out every device |
| `createdAt`, `updatedAt` | timestamptz | |

### RefreshToken

| Field | Type | Notes |
|---|---|---|
| `id` | cuid | |
| `userId` | → User | Cascade delete |
| `tokenHash` | text, unique | SHA-256 hex; the token itself is never stored |
| `familyId` | uuid | Shared by every token rotated from one sign-in |
| `expiresAt` | timestamptz | `REFRESH_TOKEN_TTL_DAYS` after issue |
| `revokedAt` | timestamptz? | Set on rotation, sign-out, reset, or family revocation |
| `createdAt` | timestamptz | |

A presented token that is already revoked revokes its whole family (reuse
detection). Indexed on `userId` and `familyId`.

### EmailToken

Single-use links sent by email.

| Field | Type | Notes |
|---|---|---|
| `id` | cuid | |
| `userId` | → User | Cascade delete |
| `purpose` | `VERIFY_EMAIL` \| `RESET_PASSWORD` | A token only works for its own purpose |
| `tokenHash` | text, unique | SHA-256 hex of the token in the link |
| `expiresAt` | timestamptz | 24 h for verify, 1 h for reset |
| `usedAt` | timestamptz? | Set when used, or when a newer link of the same purpose replaces it |
| `createdAt` | timestamptz | |

Claimed with a conditional update (`WHERE usedAt IS NULL`) so a link can't be
used twice, even concurrently.

## Donations

`Donation` belongs to a campaign (restrict delete) and optionally a signed-in
user (set null on user deletion). It stores a normalized private donor email,
a unique SHA-256 idempotency-key hash, a unique random merchant reference,
provider name and nullable provider checkout/payment IDs. Each provider + ID
pair is unique. Indexes cover campaign + status and donor user.

`amount`, `platformFee`, `donorFee`, `totalCharged` and `netToCampaign` are
BigInt minor units with `currency` and `donorCoversPlatformFee` saved as an
immutable fee snapshot. A database check requires nonnegative allocations and
`totalCharged = netToCampaign + platformFee + donorFee`.

`status` is `PENDING`, `SUCCEEDED`, `FAILED` or `EXPIRED`. The separate
`checkoutState` is `INITIALIZING`, `READY`, `FAILED` or `UNCERTAIN`, describing
whether hosted checkout creation completed, not whether the donor paid.
`checkoutUrl` is private to the caller holding the donation status capability.
`succeededAt` and `stateEventAt` are reserved for verified webhook processing.
`createdAt` and `updatedAt` are timestamptz. No mutable balance is stored.
