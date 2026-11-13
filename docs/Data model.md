---
title: Data model
tags:
  - data-model
---

# Data model

PostgreSQL via Prisma 7. The schema lives in `apps/api/prisma/schema.prisma`;
migrations in `apps/api/prisma/migrations/`. Every timestamp is `timestamptz`.
IDs are cuids except withdrawal IDs (UUID v4) and audit event IDs (PostgreSQL UUIDs). Money columns (from M2) are `BigInt` minor units with a
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
| `shortCode` | text, unique | 5 characters (`abcdefghjkmnpqrstuvwxyz23456789`) for the short link `/c/<code>` on posters and QR codes; the slug's suffix for campaigns created through the API, `campaign_short_code()` by default otherwise; fixed at creation |
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
| `emailVerifiedAt` | timestamptz? | Set by the verify link, a password reset, or Google sign-in |
| `googleSubject` | text?, unique | Google's account id (`sub`), set on first Google sign-in. Google-only accounts get an unusable random `passwordHash` |
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

### PaymentEvent

Stores provider + event ID (unique), exact raw body (`bytea`), normalized event
type, resource ID, merchant reference, optional minor-unit amount/currency,
source `occurredAt`, first `receivedAt`, optional `processedAt`, processing
`outcome`/`reason`, and `lastDispatchAt` for fair recovery scanning. Indexed on
`(processedAt, lastDispatchAt)`. A null processed timestamp is a durable outbox
item, whether Redis accepted the job or not. Reasons are fixed internal codes,
not upstream errors or personal information.

`Donation.ledgerTransactionId` uniquely links a successful donation to the
existing ledger posting. A check requires that link whenever status is
`SUCCEEDED`. A trigger prevents edits to monetary snapshot fields, reference,
provider, campaign and idempotency-key hash after reservation. Payment state,
ledger entries and event completion commit atomically.

## Notification delivery

`NotificationDelivery` is a durable email outbox. Its unique `dedupeKey` identifies
one donor receipt or one creator campaign/minute batch. It snapshots `recipient`,
`campaignTitle`, `campaignUrl`, `currency` and rendered `subject`/`text`/`html`.
Creator content is rendered and frozen when the row is claimed. States are
`PENDING`, `SENDING`, `SENT`, `UNCERTAIN` and `FAILED`; delivery tracks attempts,
next attempt, start/send timestamps and a fixed internal last-error code.
Indexes cover `(state, nextAttemptAt)` and `(state, startedAt)`.

`DonationNotification` links a settled donation to its outbox delivery. Unique
`(donationId, kind)` permits one `DONOR_RECEIPT` and one `CREATOR_DONATIONS` item.
Multiple creator items can share a delivery, but every donor receipt has its own
row. Foreign keys restrict deletion of related donations/deliveries. These rows
and the financial settlement commit together; SMTP happens afterward.


## Withdrawals

`Campaign.payoutsFrozen` and `payoutFreezeReason` control new withdrawal
reservations. `PayoutFreezeEvent` records campaign, acting admin, frozen flag,
reason and timestamp for every freeze/unfreeze operation.

`Withdrawal` retains the immutable campaign/owner/account relations, a masked
bank snapshot (name, account holder and last four digits), private recipient and
provider identifiers, unique merchant reference, owner-scoped idempotency-key
hash, currency, gross wallet debit, flat fee and net bank amount. Foreign keys
link the required hold and optional settlement/reversal ledger transactions;
each posting can belong to only one withdrawal step. Amounts are positive,
fees non-negative and `amount = fee + netPaidOut`, enforced in PostgreSQL.
Succeeded/failed/reversed statuses require their matching posting IDs.

States: `INITIALIZING`, `PENDING`, `UNCERTAIN`, `SUCCEEDED`, `FAILED`, `REVERSED`.
`reconciliationRequired`, a fixed reason code and `stateEventAt` retain review
and event-ordering context. Rows and account snapshots survive soft removal of
a bank account. History is indexed by campaign/owner and creation time;
provider payout IDs are unique per provider.

Every debit reservation locks its campaign before reading the ledger-derived
wallet balance. Payout settlement uses the same campaign lock, then the
withdrawal lock. Ledger accounts are resolved in canonical key order to avoid
opposite lock orders between different posting types. Future wallet-debit
features must use this campaign locking convention too.


### Campaign video

`Campaign.videoUrl` is nullable text containing one canonical YouTube watch URL.
The API canonicalizes supported input URLs; a PostgreSQL check rejects other
stored formats. Existing campaigns remain null and retain the photo gallery.
No embed HTML, tracking parameters or third-party thumbnail is stored.

## Campaign engagement updates

- `Donation.updatesOptIn`: explicit checkout consent, defaults false for all
  existing and new donations. Subscription creation happens in the settlement
  transaction alongside the receipt outbox.
- `CampaignUpdate`: immutable title/body, author and campaign, publication time,
  original upload keys, owner-scoped unique idempotency hash; soft-removal time
  and actor. `fanoutCursor` and `fanoutCompletedAt` persist notification work.
- `CampaignUpdateImage`: ordered, validated server-owned storage snapshots,
  separate from the campaign gallery. Three photos maximum via API.
- `CampaignUpdateSubscription`: unique `(campaignId, email)`, settled donation
  anchor, creation/consent/unsubscribe timestamps. A duplicate or older payment
  cannot undo an unsubscribe; a new, later explicit opt-in can subscribe again.
- `NotificationDelivery`: `CAMPAIGN_UPDATE` kind plus update/subscription foreign
  keys. A unique dedupe key identifies one post/recipient delivery. Existing
  retry and uncertain-SMTP states apply; there is no new money movement.

Posts, photos and subscriptions use restrictive foreign keys and are retained
for history. Private subscription data is never returned by public or owner
campaign endpoints. Rotating `JWT_SECRET` invalidates old unsubscribe
capabilities; keep the old deployment secret stable while its emails are live.

## Donor disclosure preferences

`Donation.donorName` (nullable, at most 100 characters) and `donorMessage`
(nullable, at most 500) store optional supplied text. `isAnonymous` defaults
true, including pre-existing donations. Database constraints require a name
when public attribution is chosen and bound the stored text lengths.

All three preferences are immutable checkout snapshots. Confirmed public gifts
map the chosen name or “Anonymous” plus the message, never private identity
fields. Owners/admins can review supplied preferences, but email is excluded.
Messages are public even when a name is anonymous; the checkout explains this.

## Campaign review decisions

`CampaignReview` retains `campaignId`, `reviewerId`, `decision` (`APPROVE` or
`REJECT`), optional rejection `reason`, the submission's `submittedAt` and
`reviewedVersion` (`Campaign.updatedAt`), plus its own `createdAt`. The write is
atomic with the campaign status change. Foreign keys restrict deletion of the
reviewed campaign and reviewer; history is not exposed by public campaign reads.
Database checks enforce decision values and a non-empty rejection reason.

Pre-existing decisions are not backfilled because their actor/version cannot be
reliably inferred. An empty history on an older campaign does not mean it has
never been reviewed. This is a focused review history, not the general audit log.

## Reports and moderation

`CampaignReport` stores its campaign, category, bounded plain-text detail,
OPEN/RESOLVED/DISMISSED status, unique request hash and creation/update/closure
timestamps. No reporter account, email or IP is stored in this model.

`ReportModerationAction` records report/campaign/actor references, action,
reason and timestamp. Restrictive foreign keys retain investigation history.
Database checks bound report text, category, state/closure consistency and
action/reason values. Existing `PayoutFreezeEvent` also records freezes/releases.

`Campaign.moderationPaused` and `moderationPauseReason` distinguish an admin
restriction from a creator pause. Owner resume uses a conditional update requiring
the restriction to be false. Admin report actions lock campaign then report,
compare inspected versions and commit action history with restriction/state
changes. There are no new ledger movements or changes to held payouts.

## Identity verification

`IdentityVerification` is one attempt to verify a person: `userId`, `provider`
(`manual`, `qoreid`, `dojah`, `smile`) and optional `providerReference`, `status`
(`PENDING`/`VERIFIED`/`REJECTED`), `documentType`, `idNumberLast4`, the
entered `legalName` and `dateOfBirth` (a date), `verifiedName` once verified,
the encrypted document's `documentKey` and `documentContentType`, the
creator-facing `reason`, `reviewerId` and `decidedAt`.

- A partial unique index allows one `PENDING` row per user. Reservation locks
  the subject user and rechecks pending/verified state before a vendor call.
- `documentType` additionally supports `BVN`. Vendor selfie uploads use the
  encrypted document fields and the same deletion/retention rules. Smile checks
  store a random local reference before dispatch, echoed as `customer_ref_id`.
- Checks: `idNumberLast4` is 1–4 characters; a decided row has `decidedAt`
  and a pending one doesn't; a `VERIFIED` row has `verifiedName`.
- The full ID number is never stored. Documents live in storage at
  `kyc/<userId>/<random>.<ext>.enc`, AES-256-GCM encrypted with the key bound
  as associated data. Declining deletes the document and clears the key.
- A person is verified when they have a `VERIFIED` row; the latest one's
  `verifiedName` is what payout accounts must match. Rows are kept as history.
- `documentDeletedAt` is set when the retention sweep deletes a verified
  person's photo (`KYC_DOCUMENT_RETENTION_DAYS` after the decision); a check
  requires `documentKey` to be null then.

`IdentityDocumentUpload` tracks a photo uploaded but not yet submitted: `key`
(primary key), `userId`, `createdAt`. Submitting deletes the row in the same
transaction as creating the verification; the hourly sweep deletes the file
behind any row older than a day. Only keys recorded here are ever deleted, so a
bucket shared with another environment is safe.

`PayoutNameReview` is a creator's request to withdraw to an account whose
bank name differs from their verified name: `bankAccountId`, `userId`,
`status` (`PENDING`/`APPROVED`/`DECLINED`/`CANCELLED`), the creator's
`explanation` (10–500), snapshots of `accountName` and `verifiedName`,
`reviewerId`, `reason` (required to decline), `decidedAt`, `updatedAt`.

- A partial unique index allows one `PENDING` review per account.
- Checks: a pending row has no decision fields; `APPROVED`/`DECLINED` have a
  reviewer and time; `CANCELLED` (the owner removed the account) has a time and
  no reviewer.
- Withdrawals accept a mismatched account only with an `APPROVED` review whose
  `verifiedName` and `accountName` equal the current ones.

## AuditEvent

Append-only redacted journal created by database triggers in the same transaction
as source changes. UUID text `id` defaults to PostgreSQL `gen_random_uuid()`;
`createdAt` is a timestamptz. `actorId` and `subjectId` are nullable historical
identifiers, not joined to mutable profiles or cascade-deleted. `targetType` and
`targetId` identify the changed row; `action` describes its change category.
`before` and `after` are nullable JSON objects built from explicit control fields.
No personal names, banking numbers, document metadata or free text is copied.

Indexed by timestamp/id, actor/time, subject/time, target type/id/time and
action/time. Source triggers cover Campaign status/restrictions, CampaignReport
status, IdentityVerification status updates and ID photo deletions
(`IDENTITY_DOCUMENT_DELETED`), BankAccount insertion/default/soft removal,
PayoutNameReview requests and decisions (`PAYOUT_NAME_REVIEW_REQUESTED`,
`PAYOUT_NAME_REVIEWED`), OrganisationMember additions, role changes and
removals (`ORG_MEMBER_ADDED`, `ORG_ROLE_CHANGED`, `ORG_MEMBER_REMOVED`, from
their own trigger function because removals only have the old row),
OrganisationVerification decisions (`ORG_VERIFICATION_DECIDED`) and User
role updates. Automatic jobs record a
`system:` actor (the retention sweep is `system:id-photo-retention`). Initial KYC submissions, ordinary profile edits,
unchanged control fields and rejected transactions do not add events. Existing
campaign-review, moderation and payout-freeze records remain authoritative for
their reasons and operational detail.

Statement triggers reject event UPDATE, DELETE and TRUNCATE. A database owner can
still disable triggers or change schema; this is not an external tamper-proof
archive. No automatic retention deletion is performed.

## Organisations

`Organisation`: `slug` (unique, `name-k7m2q` like campaign slugs, fixed),
`name` (2–100), `about` (≤2000), optional `website` (http/https) and
`location`, `createdById`, timestamps.

`OrganisationMember`: one row per person per organisation (`organisationId` +
`userId` unique), `role` `OWNER`/`ADMIN`/`EDITOR`/`FINANCE`. Every
organisation keeps at least one `OWNER`: team changes lock the organisation row
and check before demoting or removing an owner.

`OrganisationInvite`: `email` (lower-cased), `role`, `tokenHash` (SHA-256,
unique), `invitedById`, `expiresAt` (7 days), `acceptedAt` or `revokedAt` (never
both). A partial unique index allows one open invite per email per
organisation; a new one revokes the old.

`OrganisationVerification`: one attempt to verify an organisation from its
registration certificate. `submittedById`, `status`
(`PENDING`/`VERIFIED`/`REJECTED`), `registrationType`
(`BUSINESS_NAME`/`COMPANY`/`INCORPORATED_TRUSTEES`), `registrationNumber`
(upper-case letters, digits, spaces, `/` and `-`; public record in Nigeria, so
stored in full), `registeredName`, `verifiedName` once verified, the encrypted
certificate's `documentKey` and `documentContentType` (cleared when declined),
`reason`, `reviewerId`, `decidedAt`. One `PENDING` row per organisation
(partial unique index); a decided row has `decidedAt`, a verified one a
`verifiedName`, a declined one a `reason`. Certificate photos live at
`org-docs/<organisationId>/<random>.<ext>.enc`, encrypted like ID photos, and
unsubmitted uploads are tracked in `IdentityDocumentUpload` and swept after a
day.


## Deployment settings and payout retries

`DeploymentSettings` has singleton id `site`, a validated public branding/fee
JSON `values` snapshot, integer `version`, and `updatedAt`. No credentials live
here. Absence means environment defaults. Changes serialize under an advisory
lock and compare the submitted revision, with explicit audit before/after.

`Withdrawal.retryOfId` is a nullable unique self-reference. It links one new
attempt to a confirmed returned payout. The original hold/return and fee
snapshot stay intact; the successor gets its own reservation, merchant reference
and one claimed dispatch. The unique constraint plus campaign locking prevents
concurrent operators creating two successors for the same original attempt.
