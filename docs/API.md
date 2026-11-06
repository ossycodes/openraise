---
title: API
tags:
  - api
---

# API

REST, JSON. Base URL `http://localhost:4000` in development. Money is always
minor units (kobo, cents) sent as **strings** so BigInt survives JSON.

## Health

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/health` | — | `{ "status": "ok" }` |

## Auth

Access tokens are JWTs (15 minutes by default) sent as
`Authorization: Bearer <token>`. Refresh tokens are opaque, single use and
rotate on every refresh. See [[Email and password auth]].

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/auth/signup` | — | `{ name, email, password }` | 201 `AuthResult`; emails a confirm link. 409 if the email is taken |
| POST | `/auth/signin` | — | `{ email, password }` | 200 `AuthResult`; 401 with the same message for unknown email and wrong password |
| POST | `/auth/google` | — | `{ credential }` (a Google ID token) | 200 `AuthResult`; creates or links the account by verified email. 401 if the token fails verification, 409 if the email is linked to another Google account, 503 if `GOOGLE_CLIENT_ID` is unset. See [[Google sign-in]] |
| POST | `/auth/refresh` | — | `{ refreshToken }` | 200 `AuthResult` (new pair); 401 if spent, expired or revoked. A token spent in the last 30 seconds while its sign-in is live gets 401 `{ code: "REFRESH_RACE" }` (retry with the newer token) and the sign-in survives; any other reuse revokes it |
| POST | `/auth/signout` | — | `{ refreshToken }` | 204; revokes every token from that sign-in |
| POST | `/auth/verify-email` | — | `{ token }` | 204; 400 if the link is invalid, used or expired |
| POST | `/auth/verify-email/resend` | Bearer | — | 202; replaces any earlier link |
| POST | `/auth/password/forgot` | — | `{ email }` | 202 always |
| POST | `/auth/password/reset` | — | `{ token, password }` | 204; signs out every device |

`AuthResult`:

```json
{
  "user": { "id": "…", "email": "ada@example.com", "name": "Ada Obi", "role": "USER", "emailVerified": false, "createdAt": "2026-11-05T11:31:31.539Z" },
  "accessToken": "eyJ…",
  "expiresIn": 900,
  "refreshToken": "kq3…"
}
```

Validation errors are 400 with `{ "message": "Validation failed", "errors": [{ "path": "email", "message": "…" }] }`.
Passwords need at least 10 characters.

## Users

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/users/me` | Bearer | The signed-in user (same shape as `AuthResult.user`) |

## Categories

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| GET | `/categories` | — | — | `[{ id, slug, name, description, sortOrder }]`, ordered by `sortOrder` |
| GET | `/categories/:slug` | — | — | One category; 404 if unknown |
| POST | `/categories` | Admin | `{ slug, name, description?, sortOrder? }` | 201; 409 if the slug exists |
| PATCH | `/categories/:slug` | Admin | `{ name?, description?, sortOrder? }` | 200; the slug can't change |

"Admin" means a Bearer token for a user with `role: ADMIN` (401 without a
token, 403 for other roles).

## Campaigns

Reads use the public **slug**; writes use the **id**. Someone else's
campaign, or an unpublished one you can't see, is always 404 (never 403), so
ids and slugs can't be probed. See [[Campaigns]].

| Method | Path | Auth | Body / query | Returns |
|---|---|---|---|---|
| POST | `/campaigns` | Bearer | `{ title, categorySlug, goalAmount, currency?, summary?, story?, beneficiaryName?, location?, endsAt? }` | 201, a `DRAFT` |
| GET | `/campaigns` | — | `?category=&featured=&page=&limit=` (limit ≤ 50) | `{ items, page, limit, total }`; `ACTIVE` only, newest first |
| GET | `/campaigns/mine` | Bearer | — | Every campaign you own, any status |
| GET | `/campaigns/:slug` | Optional | — | Public if `ACTIVE`, `PAUSED` or `ENDED`; otherwise owner and admins only |
| PATCH | `/campaigns/:id` | Owner | Any create field; `null` clears optional ones | 200; 409 while in review or once ended, or when changing currency after submit |
| DELETE | `/campaigns/:id` | Owner | — | 204; drafts only (409 otherwise) |
| POST | `/campaigns/:id/submit` | Owner | — | `PENDING_REVIEW`; 403 if email unverified; 400 listing what's missing |
| POST | `/campaigns/:id/pause` / `resume` / `end` | Owner | — | New status; 409 if not allowed from the current one |
| POST | `/campaigns/:id/approve` | Admin | — | `ACTIVE`, sets `publishedAt` |
| POST | `/campaigns/:id/reject` | Admin | `{ reason }` | `REJECTED`; the reason is shown to the owner |

`goalAmount` and `raisedAmount` are minor units as strings (`"50000000"` =
₦500,000). `raisedAmount` is gross donations backed by committed ledger postings;
`donorCount` is distinct normalized donor emails among those donations.
Pending, failed and expired payments do not contribute.
`rejectionReason` is only included for the owner and admins.
Every campaign also carries `images` (`[{ id, url, position, contentType, size }]`,
in display order) and `coverImageUrl` (the first image's URL, or `null`).

### Campaign images

Owner only, with the same editing rules as the campaign (409 while in review
or once ended). Each call that changes images returns the full image list.
See [[Campaign images]].

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/campaigns/:id/images/upload-url` | `{ contentType: "image/jpeg" \| "image/png" \| "image/webp", size }` (≤ 5 MB) | 201 `{ key, uploadUrl, method: "PUT", headers, expiresIn, maxBytes }`; 409 at 10 images |
| POST | `/campaigns/:id/images` | `{ key }` | 201 image list; 400 if not uploaded, over 5 MB, not really an image, or from another campaign |
| PUT | `/campaigns/:id/images/order` | `{ imageIds }` (every image, once) | Image list in the new order |
| DELETE | `/campaigns/:id/images/:imageId` | — | Image list; the file is deleted from storage |

Uploading is two steps: `PUT` the file to `uploadUrl` with exactly the
`headers` returned (10 minutes to do it), then attach the `key`.

## Payout bank accounts

All Bearer; every account is the signed-in user's own (others answer 404).
503 when the deployment has payments disabled; 502 when the provider fails.
See [[Bank accounts]].

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/banks` | — | `[{ code, name }]`, Nigerian banks the provider can pay, by name |
| POST | `/bank-accounts/resolve` | `{ bankCode, accountNumber }` (10 digits) | 200 `{ bankCode, bankName, accountName, maskedAccountNumber }`; 400 if not found |
| POST | `/bank-accounts` | `{ bankCode, accountNumber }` | 201 account; 403 unverified email; 409 duplicate or more than 5 |
| GET | `/bank-accounts` | — | Active accounts, default first |
| PUT | `/bank-accounts/:id/default` | — | Account list |
| DELETE | `/bank-accounts/:id` | — | Account list (removed accounts are kept for history) |

An account:

```json
{
  "id": "…", "bankCode": "058", "bankName": "GTBank", "accountName": "OBI ADA CHIOMA",
  "maskedAccountNumber": "******6789", "isDefault": true, "recipientUsable": true,
  "nameMatchesProfile": true, "payoutsAvailableAt": "2026-11-06T14:15:00.000Z",
  "createdAt": "2026-11-05T14:15:00.000Z"
}
```

## Config

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/config/fees` | — | Every fee this deployment charges (see below) |
| GET | `/config/site` | — | Branding and public sign-in config: `{ name, logoUrl, primaryColor, supportEmail, googleClientId }` |

```json
{
  "currency": "NGN",
  "platformFeeBps": 350,
  "donorFeeBps": 150,
  "donorFlatFee": "10000",
  "donorFlatFeeThreshold": "250000",
  "withdrawalFee": "5000"
}
```

`*Bps` are basis points (350 = 3.5%). The flat donor fee applies when the
charge is above the threshold. See [[Fee engine]].

## Donation checkout

| Method | Path | Auth | Body / headers | Returns |
|---|---|---|---|---|
| GET | `/campaigns/:slug/donations` | — | — | Latest six ledger-backed confirmed donations (`sort=recent`, default), or top six anonymous supporters by combined giving (`sort=top`): `{ items: [{ id, amount, currency, confirmedAt }] }`; no donor identities, 404 for private campaigns |
| POST | `/campaigns/:slug/donations/quote` | — | `{ amount, currency?, donorCoversPlatformFee? }` | 201 server-computed fees, currency, provider, minimumAmount; creates nothing |
| POST | `/campaigns/:slug/donations/checkout` | Optional Bearer | `{ amount, currency?, donorCoversPlatformFee?, email? }`; `Idempotency-Key` random UUID v4 | 201 pending donation, fee snapshot, hosted checkoutUrl, statusToken |
| GET | `/donations/:id` | Donation capability | `X-Donation-Token: <statusToken>` | Current status and saved fees; 404 without the matching token |

Amounts are positive minor-unit strings; currency defaults to the campaign's
fixed currency and must match it. Only active campaigns before their end date
accept new checkouts. Guests must supply an email; signed-in donors use their
account email. Fees and total charge are computed on the server and stored
before calling the provider. Numeric amounts and client-supplied fees are 400.

Reuse the same idempotency key with exactly the same donation input after a
network failure. A completed checkout initialization replays its original fees
and URL even after fee settings or the campaign status changes. Different input
with the same key is 409. A concurrent request still initializing is 409; retry
with that key. A provider rejection is 503 and marks the donation failed. An
ambiguous write is 503 with `donationId` and `statusToken`, stays pending and
requires reconciliation; the server does not call the provider again for that
key. Do not create a replacement charge automatically after an ambiguous result.

Keep the key and status token private. Status responses expose no donor email,
provider credentials or raw idempotency key. Tokens are derived from the server
JWT secret and donation ID; rotating that secret invalidates them. Redirects
back to the campaign never confirm payment. No endpoint in this feature marks
a donation succeeded; confirmation comes from [[Payment webhooks]]. Payments
are 503 when `PAYMENT_PROVIDER=disabled`.

## Payment webhooks

| Method | Path | Auth | Returns |
|---|---|---|---|
| POST | `/webhooks/:provider` | Provider signature on original JSON bytes | 202 `{ received: true }` after persistence and queue handoff |

The provider path must match the configured adapter (`paystack` or `bachs`).
Disabled/other providers return 404. Paystack uses `X-Paystack-Signature`;
Bachs uses `X-Bachs-Signature-V2` with ±300-second delivery tolerance and any
matching `v1` during secret rotation. Invalid signatures or malformed payloads
return 400 without changing donations. The normal JSON body-size limit applies.

Duplicate provider event IDs reuse the stored first delivery. Unsupported signed
events return 202 and are retained as ignored. Internal persistence failures
return 5xx; queue failure returns 503 while keeping the durable event for retry.
Redis jobs and a database recovery scan apply payment state later. Workers check
reference, currency, exact charged amount and event ordering before settling a
donation and its balanced ledger posting in one transaction. Redirects and
client calls cannot settle a donation. Payout events are applied by the withdrawal processor (see below). Refund
business processing is not yet enabled; refund events remain ignored.

## Donation notifications

Verified successful donations queue an email receipt and a creator notification;
there is no client endpoint that can trigger or resend them. Receipt amounts and
fees use the saved checkout snapshot. Creator summaries batch by campaign/minute
and omit donor identities. Email failure does not undo a settled payment. Known
non-acceptance retries asynchronously; ambiguous SMTP outcomes are held for
operator reconciliation. See [[Donor receipts]] and [[Receipt delivery]].

## Withdrawals

Amounts are decimal strings of minor units. Withdrawals debit the campaign wallet
by `amount`; the configured flat `fee` is included, so `netPaidOut = amount - fee`.
The provider receives only `netPaidOut`. The first payout route supports NGN
campaigns and Nigerian bank accounts; there is no currency conversion.

| Method | Path | Auth | Body / result |
|---|---|---|---|
| POST | `/campaigns/:id/withdrawals/quote` | Owner Bearer | `{ amount }` → fee breakdown, available balance, freeze and support flags; creates nothing |
| POST | `/campaigns/:id/withdrawals` | Verified owner Bearer | `{ amount, bankAccountId, expectedFee }` + random UUID v4 `Idempotency-Key` → saved withdrawal and status, 201 |
| GET | `/campaigns/:id/withdrawals?page=1` | Owner Bearer | Private `{ items, page, hasMore }`, 20 per page |
| GET | `/withdrawals/:id` | Requesting owner Bearer | Private status, immutable fees and masked bank snapshot; 404 for others |
| PUT | `/admin/campaigns/:id/payout-freeze` | Admin Bearer | `{ frozen, reason }` → current freeze; every change is audited |
| GET | `/admin/withdrawals/review?page=1` | Admin Bearer | Uncertain, flagged, initialization older than one minute and pending older than 24 hours; includes merchant/provider identifiers for reconciliation |
| GET | `/campaigns/:slug/money-trail/withdrawals?page=1` | Public | Money, status and timestamps only; no bank/donor/creator identifiers; 404 for unpublished campaigns |

The fee quote must be reviewed: `expectedFee` must match the current configured
fee. Reusing a key for the same campaign, amount, account and fee returns the
original withdrawal even after settings or destination state change. A different
payload returns 409. The key is scoped to the authenticated owner and stored as
a hash. Missing/invalid keys or invalid money return 400. Insufficient balance,
ineligible recipients, a bank's 24-hour hold and changed fees return 409. A freeze
or unverified email returns 403. Disabled payouts return 503 for new requests.
Another owner's campaign/account/withdrawal returns 404.

Before any provider call, one database transaction locks the campaign, verifies
the destination, snapshots its masked details and fees, and posts a balanced
wallet-to-pending hold. Concurrent reservations cannot overspend the wallet.
No database transaction spans provider I/O. Dispatch is claimed once; replaying
or refreshing a request never sends another payout. Pending and ambiguous
outcomes retain the hold. An explicit provider rejection returns the hold;
unknown or interrupted initialization requires reconciliation. See
[[Withdrawal reconciliation]].

Signature-verified payout events must match provider, merchant reference,
provider payout ID (when already known), exact net amount and currency. Success
settles the pending liability; failure returns it. Paystack's explicit reversal
can also return a previously settled payout and its configured fee once.
Contradictory terminal events are flagged for review without moving money again.
A positive create response alone remains pending until the signed payout event.
A freeze blocks new reservations; payouts already reserved may still complete.

Private responses omit full account numbers, recipient IDs and idempotency
hashes. Public history additionally omits bank/account names, account IDs,
merchant/provider references and internal reconciliation reasons. All reads
are no-store. Provider transfer expenses are separate from OpenRaise's
configured withdrawal fee; live provider reconciliation is still required.

## Creator money

Owner-only (Bearer); another owner's campaign answers 404. Read only, no-store.
Counts only donations that succeeded and were posted to the ledger, the same
rule as `raisedAmount`. Donor identities are never included; see
[[Decisions#Creators see amounts, not donors]].

| Method | Path | Returns |
|---|---|---|
| GET | `/campaigns/:id/money` | `{ currency, donationCount, raised, platformFees, received, available, withdrawalsInProgress, paidOut, withdrawalFeesPaid, withdrawalFee, payoutsSupported, payoutsFrozen, payoutFreezeReason }`; `available` is the ledger wallet balance |
| GET | `/campaigns/:id/donations/received?page=1` | `{ items: [{ id, currency, amount, platformFee, donorFee, netToCampaign, donorCoveredPlatformFee, confirmedAt }], page, hasMore }`, newest first, 25 per page |
| GET | `/campaigns/:id/donations/received.csv` | Every confirmed donation as CSV (`confirmed_at,donation_id,currency,amount,platform_fee,donor_fee,net_to_campaign`), amounts in major units |

### Optional campaign YouTube video

`POST /campaigns` and `PATCH /campaigns/:id` accept `videoUrl`, a YouTube HTTPS
video link. Supported forms: watch URLs on youtube.com (including www/mobile/music),
youtu.be share links, Shorts, Live and single-video embed links. The API stores and
returns only `https://www.youtube.com/watch?v=<11-character-id>`; tracking,
playlist, timestamp and playback parameters are discarded. `videoUrl: null`
removes a video; omitting it on update preserves the existing one. Existing
campaigns return null. Ownership, visibility and review locks are unchanged.

Invalid hosts, non-HTTPS URLs, credentials, custom ports, malformed video IDs,
playlist-only URLs and raw iframe HTML return 400. Validation checks URL shape,
not whether YouTube permits viewing/embedding a particular video. No server-side
request to the submitted URL is made. PostgreSQL also restricts the stored value
to the canonical URL shape. Public lists/detail return the optional field.

The public media section shows video first when present and keeps uploaded photos
available. The YouTube privacy-enhanced iframe loads only after an explicit click,
with no autoplay. A direct YouTube link remains available for blocked, private,
removed or embedding-disabled videos. Creator dashboard form integration is a
separate feature. See [[Campaign video]].

## Campaign updates

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| GET | `/campaigns/:slug/updates?page=1` | — | — | `{ items, page, hasMore }`, newest first, ten per page, public campaigns only; hidden posts excluded |
| GET | `/campaigns/:id/updates/mine?page=1` | Owner | — | Same shape, including removed posts with `hiddenAt` |
| POST | `/campaigns/:id/updates/images/upload-url` | Verified owner | `{ contentType, size }` | Presigned PUT ticket for JPEG/PNG/WebP, at most 5 MB |
| POST | `/campaigns/:id/updates` | Verified owner | `{ title, body, imageKeys?: [] }` | 201 published update; UUID v4 `Idempotency-Key` required |
| DELETE | `/campaign-updates/:id` | Owner | — | Soft removal; queued emails cancelled |
| DELETE | `/admin/campaign-updates/:id` | Admin | — | Audited soft removal |
| POST | `/campaign-update-subscriptions/:id/unsubscribe` | Signed capability | `{ token }` | `{ unsubscribed: true }`; repeatable, invalid link 404 |

An update has `id`, `title`, `body`, `publishedAt`, `hiddenAt`, and `images`
(`id`, `url`, `position`). Title is 3–120 characters, plain-text body 10–5,000,
with at most three distinct image keys from this campaign's update uploads.
At publication, images are copied to server-owned keys and validated from the
stored copy. Reusing the request key with different content returns 409.
Only approved campaigns (`ACTIVE`, `PAUSED`, `ENDED`) accept posts. Updates
are immutable; removal hides the public post but retains its audit history.

Donation checkout additionally accepts `updatesOptIn?: boolean` (default
`false`). This choice is immutable for an idempotent checkout attempt and
creates a campaign-specific subscription only when that donation settles
successfully with ledger postings. Donor receipt delivery is independent.
Subscription emails and unsubscribe tokens are never included in campaign or
owner reads. Old donations are not opted in by migration.

The web unsubscribe link carries its capability in the URL fragment, removes it
from the address bar, and requires a confirmation POST. Visiting a link with a
GET alone has no effect. Only future posts are emailed, with eligibility
checked again when delivery is claimed. Removal or unsubscribe cannot retract
an email already being sent or accepted by SMTP. See [[Receipt delivery]] for
uncertain-delivery handling.
## Donor messages and privacy

Donation quote/checkout accept optional `donorName` (100 characters),
`donorMessage` (500 characters) and `isAnonymous` (default true). Text is trimmed;
empty values become null. A non-anonymous donation requires a name. These fields
are immutable parts of the idempotent checkout snapshot; changing them under the
same key returns 409. Existing donations remain anonymous.

Recent public donations return `displayName` and `message` only after confirmed
ledger settlement. Anonymous names are always replaced with “Anonymous”; email,
user IDs and private names never appear in that response. A message is public
even when its author hides their name, as explained before checkout. Public
rankings stay anonymous, avoiding links between a donor's public and anonymous
gifts. Messages are rendered as plain text, not HTML.

Owner-only received-donation reads include the supplied name/message and anonymity
flag; CSV exports remain amounts only. `GET /admin/donations/:id` is admin-only
and includes supplied donor preferences for review, without payment capabilities,
account identifiers or email addresses. A supplied name is not identity-verified.

## Admin campaign review

All endpoints require a current `ADMIN` role (401 signed out, 403 non-admin).
Reads use `Cache-Control: no-store` and never expose donor information or
organiser email/password fields.

| Method | Path | Body/query | Returns |
|---|---|---|---|
| GET | `/admin/campaigns` | `status=PENDING_REVIEW\|ACTIVE\|REJECTED`, `q` ≤100 characters, `page` 1–1000 | `{ items, total, pending, page, limit: 20 }`; oldest submissions first, search title or organiser name |
| GET | `/admin/campaigns/:id` | — | `{ campaign, organiser: { name, emailVerified, createdAt }, reviews }`; latest 20 decisions, reviewer names and reasons |
| POST | `/admin/campaigns/:id/review` | `{ decision: "APPROVE"\|"REJECT", expectedUpdatedAt, reason? }` | 200 campaign; 409 if stale/already reviewed/expired approval, 403 self-review |

`expectedUpdatedAt` is the exact ISO timestamp from the inspected campaign.
Rejection needs 3–1000 trimmed characters. Approvals move `PENDING_REVIEW` to
`ACTIVE`; rejection moves it to `REJECTED`. The campaign transition and history
insert commit together. A lost response should be followed by reloading the
campaign; another decision cannot duplicate the committed transition.

The legacy `/campaigns/:id/approve` and `/reject` routes now also record reviewer
history and reject self-review. Their existing payloads remain compatible; the
new review endpoint is required for browser submission-version protection.

## Campaign reports and moderation

| Method | Path | Auth | Input | Returns |
|---|---|---|---|---|
| POST | `/campaigns/:slug/reports` | Guest allowed | UUID v4 `Idempotency-Key`; `{ category, details }` | 202 `{ received: true }`; no report ID or private read capability |
| GET | `/admin/reports` | Admin | `status=OPEN\|RESOLVED\|DISMISSED`, `q` campaign title ≤100 chars, `page` 1–1000 | `{ items, total, open, page, limit: 20 }`, oldest first; detail excerpts ≤160 chars |
| GET | `/admin/reports/:id` | Admin | — | `{ report, campaign, controls, actions }`; latest 50 actions and current restriction/version snapshots |
| POST | `/admin/reports/:id/actions` | Admin | `{ action, reason, expectedReportUpdatedAt, expectedCampaignUpdatedAt }` | 200 `{ recorded: true }`; 409 stale/no-op/invalid state, 403 self-moderation |

Report categories: `FRAUD`, `MISLEADING`, `OFFENSIVE`, `OTHER`. Trimmed detail
must have 20–2,000 characters. Only public `ACTIVE`, `PAUSED`, `ENDED` campaigns
accept reports. Repeated keys with identical input return the same acknowledgement;
changed input returns 409. Request throttling is described in [[Rate limiting deployment]].

Actions: `PAUSE`, `LIFT_PAUSE`, `FREEZE`, `UNFREEZE`, `RESOLVE`, `DISMISS`.
Reasons are 5–500 trimmed characters. Version timestamps must match the latest
inspected report and campaign. Every action is recorded atomically with its
state changes. Missing/lost responses require reload before another action.
Resolving/dismissing applies only to open reports; restrictions can be lifted
explicitly even after closure. Lifting an admin pause does not resume donations.
Freeze operations prevent new reservations, not transfers already in progress.

All reads/responses are no-store. Reports and notes are private to admins;
public and organiser campaign reads never contain report details or action
history. Owners receive only the relevant pause/freeze restriction reason.

## Identity verification

| Method | Path | Auth | Input | Returns |
|---|---|---|---|---|
| GET | `/kyc` | Signed in | — | `{ status: NONE\|PENDING\|VERIFIED\|REJECTED, provider, documentRequired, verification }` |
| POST | `/kyc/document` | Verified email | Raw image body (`Content-Type: image/jpeg\|png\|webp`), ≤5 MB | 201 `{ documentKey, contentType, size }`; 400 not an image, 413 too large, 415 not `image/*`, 409 already pending/verified |
| POST | `/kyc` | Verified email | `{ documentType, idNumber, legalName, dateOfBirth, documentKey }` | 201 own verification (status `PENDING` with `manual`); 400 field `errors`, 409 already pending/verified |
| GET | `/admin/kyc` | Admin | `status=PENDING\|VERIFIED\|REJECTED`, `q` name/email ≤100, `page` 1–1000 | `{ items, total, pending, page, limit: 20 }`; waiting oldest first, decided newest first |
| GET | `/admin/kyc/:id` | Admin | — | `{ verification, user, history }`; `hasDocument`, never the storage key |
| GET | `/admin/kyc/:id/document` | Admin | — | The decrypted ID photo; `private, no-store`, `nosniff`, `default-src 'none'` |
| POST | `/admin/kyc/:id/decision` | Admin | `{ decision: APPROVE\|REJECT, reason?, verifiedName?, expectedUpdatedAt }` | 200 detail; 400 reject without a reason, 403 own check, 409 stale or already decided |

`documentType`: `NIN_SLIP` (11-digit NIN), `PASSPORT`, `DRIVERS_LICENCE`,
`VOTERS_CARD` (5–20 letters and digits). Spaces and dashes are removed. Only the
last four characters are stored; the full number goes to the provider adapter
and nowhere else. `legalName` needs at least two names; people under 18 are
refused. The document key must be one this user uploaded.

Approving sets `verifiedName` (defaults to the entered name, corrected by the
reviewer if the ID differs). Declining needs a 5–500 character reason, which
the creator sees, and deletes the photo. Both email the creator.

Verification gates other endpoints, with `code: 'IDENTITY_UNVERIFIED'`:

- `POST /campaigns/:id/submit`: 403 until the owner is verified.
- `POST /admin/campaigns/:id/review` approving: 409 until the organiser is
  verified. The review detail's `organiser` has `identityVerified` and
  `verifiedName`.
- `POST /campaigns/:id/withdrawals`: 403 until verified, and 409
  `code: 'ACCOUNT_NAME_MISMATCH'` when the payout account's name doesn't match
  the verified name. New payout accounts' `nameMatchesProfile` uses the
  verified name once there is one.

## Request limits

Protected POST requests use shared Redis limits; see [[Rate limiting deployment]]
for groups, defaults and trusted proxy/BFF relay configuration. 429 returns
`{ code: "RATE_LIMITED", message, retryAfterSeconds }` and `Retry-After` seconds.
Redis unavailability returns 503 `{ code: "RATE_LIMIT_UNAVAILABLE", message,
retryAfterSeconds: 5 }`. Both responses are no-store and occur before the handler
performs its write. Unknown responses from earlier checkout writes still require
the existing same-key recovery flow; no automatic retry is added.

Health, payment webhooks, sign-out and donation-status reads are exempt. The API
does not blindly accept X-Forwarded-For or X-OpenRaise-Client-IP. Signatures bind
the relay address to method/path/time and exact proxy networks are configured
explicitly. Native API clients see the same Retry-After header (CORS-exposed).

## Admin money inspection

All routes below require the current ADMIN role and return no-store responses.
They are read-only and do not call payment providers or change financial state.

| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/admin/money/summary` | — | `{ asOf, transactionCount, unbalancedCount, balances, review }`; normal-sign account balances by type/currency; separate withdrawal/donation/event review counts |
| GET | `/admin/money/ledger` | `page` 1–1000, `q` ≤100, optional supported `currency`, posting `kind`, `campaignId` ≤100 | `{ items, total, page, limit: 20, campaignWallet }`; newest first, debit/credit totals as strings; campaign-filtered wallet balances when found |
| GET | `/admin/money/ledger/:id` | — | Signed entries with account type/currency, campaign links, related money-record IDs/references, signed `sum` and `balanced` flag |
| GET | `/admin/money/reconciliation` | `kind=WITHDRAWAL\|DONATION\|EVENT`, page, q, currency; campaignId for withdrawals/donations | `{ items, total, page, limit: 20 }`; oldest first. q searches reference/campaign title, or event ID/reference for events |
| GET | `/admin/money/reconciliation/:kind/:id` | — | Selected record fields, string amounts, ledger links; withdrawal destination masked and recent 20 freeze events; provider events link matched donation/withdrawal records |

Posting kinds: DONATION, WITHDRAWAL_HOLD, WITHDRAWAL_SETTLE,
WITHDRAWAL_REVERSE, REFUND, ADJUSTMENT. Ledger campaign filters follow wallet
entries and linked donation/withdrawal relations, including settlement/reversal
postings involving only global accounts. Summary checks flag missing entries,
non-zero posting sums and account/transaction currency mismatches. Summary reads
use a repeatable-read snapshot; these checks do not prove provider solvency.

Queue classification:

- Withdrawals: reconciliationRequired, UNCERTAIN, INITIALIZING older than one
  minute, or PENDING unchanged for over 24 hours. Shared with the existing
  `/admin/withdrawals/review` route.
- Checkouts: pending UNCERTAIN, pending INITIALIZING older than one minute, or
  SUCCEEDED without a ledger link. Ordinary abandoned READY checkouts are excluded.
- Events: REJECTED, unprocessed for over one minute, or ignored because a
  donation/withdrawal/reference could not be matched. Other routine ignored
  events do not enter the queue. Event queues reject campaignId filters; use
  reference search instead.

Queue counts describe records, not unique incidents, and can overlap across
categories. Detail reads may inspect a record after it leaves the queue.
Provider-event amounts may lack a known currency; clients must not infer one.
Donor identities, checkout URLs, request hashes, raw event bytes, full account
numbers and payout-recipient IDs are never returned by these endpoints.
No mutation or reconciliation-resolution endpoints are added by this feature.

## Public campaign money trail

`GET /campaigns/:slug/money-trail?page=1` is public, no-store and limited to
ACTIVE/PAUSED/ENDED campaigns. Page is an integer 1–1000; 20 withdrawal records
per page. One repeatable-read snapshot supplies summary and history.

Money is returned as minor-unit strings, all in the campaign's `currency`:

| Field | Meaning |
|---|---|
| raised, donationCount | Confirmed gifts with matching DONATION postings and campaign-wallet credits |
| platformFeesDeducted | The amount actually deducted from gifts (`amount - netToCampaign`) |
| donorCoveredPlatformFees | Platform fees paid separately by donors; not deducted from the raised total |
| received | Confirmed gifts' campaign-wallet credits |
| walletBalance | Normal-sign balance of this campaign/currency's wallet postings, after reservations |
| reserved | Gross amounts in posted reservations without a valid settlement or return |
| paidOut | Net completed payouts not subsequently returned |
| withdrawalFeesPaid | Fees retained on those completed payouts |
| returned | Gross withdrawal reservations returned to the wallet; already included in walletBalance |
| otherWalletChanges | Wallet changes outside the included gifts/withdrawal flows (e.g. adjustments/refunds) |
| asOf | Snapshot response timestamp |
| withdrawals | `{ items, page, hasMore, total }`, newest requested first |

Each history item contains only `id`, `amount`, `fee`, `netPaidOut`, `state`,
`requestedAt` and `recordedAt`. State is IN_PROGRESS, PAID or RETURNED, based on
posted ledger steps. `fee` and `netPaidOut` are request snapshots; only PAID means
the net was paid and fee retained. RETURNED means the full reservation returned.
Recorded time follows the relevant posting, not an admin's latest status edit.

Reservation postings must debit the campaign wallet by the gross request;
settlement postings must match gross pending-payout debit, net provider-clearing
credit and retained-fee credit; returns must restore the campaign wallet. Kind,
currency and wallet association are checked. Status flags alone do not establish
a public paid/returned outcome. No donor data, bank/account identifiers, provider
references, reconciliation flags, hashes or raw event payloads are returned.

The accounting identity is `raised - platformFeesDeducted + otherWalletChanges =
walletBalance + reserved + paidOut + withdrawalFeesPaid`. Returned reservations
are not subtracted a second time. Processing charges paid by donors do not enter
the campaign raised total. This is a ledger view, not proof of how money was spent.

## Admin audit log

`GET /admin/audit` requires a current administrator session and returns
`Cache-Control: no-store`. Filters: `page` (1–1000, 25 events per page),
`action` (`CAMPAIGN_CHANGED`, `REPORT_CHANGED`, `IDENTITY_DECIDED`,
`BANK_ACCOUNT_ADDED`, `BANK_ACCOUNT_CHANGED`, `ROLE_CHANGED`), `q` (exact actor,
subject, target or event ID; at most 100 characters), `from` and `to` (valid
YYYY-MM-DD dates, inclusive UTC days). Invalid or reversed date ranges return 400.

Response: `{items, page, hasMore}`. Each item has `id`, `createdAt`, nullable
`actorId`, `action`, `targetType`, `targetId`, nullable `subjectId`, and nullable
`before`/`after` objects. Snapshots contain only allowlisted control fields:
status, moderationPaused, payoutsFrozen, isDefault, removed and role.
Ordering is timestamp descending then event ID descending. Pagination is a live
history; newly committed records can shift page boundaries between requests.
There are no create, edit, delete or export endpoints for these events.

Logging starts with the audit migration. Existing source histories remain in
place; they are not backfilled with invented actors or before-states. Direct
maintenance writes without transaction-local application actor context have a
null actor. No names, emails, bank details, identity documents, provider IDs,
credentials, review notes or report allegations appear in the event snapshots.
