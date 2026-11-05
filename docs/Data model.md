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
