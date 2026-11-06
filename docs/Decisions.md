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
commit once lint, typecheck, tests and build all exit 0. The repo is
[ossycodes/openraise](https://github.com/ossycodes/openraise) (private); every
feature is a PR against `main` (never against another PR's branch), and its
note records both `branch` and `pr`.

## Fee rounding
Percentage fees round half up to the nearest minor unit (₦1.505 → ₦1.51),
always on BigInts. The platform fee comes out of the donation; if the donor
ticks "cover the fee" it's added to their charge instead and the campaign gets
the full amount. The donor processing fee is then charged on everything sent
to the processor before it (donation + covered platform fee), because that's
what the processor charges on. Invariant, tested:
`totalCharged = netToCampaign + platformFee + donorFee`.

## scrypt, not argon2
Passwords are hashed with Node's built-in `scrypt` (N=2^15, r=8, p=1), with the
parameters stored in each hash so they can be raised later. Argon2 needs a
native module, and a self-hoster on a cheap VPS shouldn't have to compile one.
Unicode is normalised (NFKC) first so the same password typed on two keyboards
matches.

## Tokens: short JWT + rotating refresh token
Access tokens are 15-minute JWTs carrying the user's `tokenVersion`; the guard
checks it against the database on every request, so a password reset signs
out every device immediately. Refresh tokens are random, stored only as
SHA-256, and single use: each refresh claims the old token with a conditional
update and issues a new one in the same family. Presenting a spent token means
it was stolen or replayed, so the whole family is revoked.

The API returns tokens in JSON rather than setting cookies. The Next.js app
keeps the refresh token in an httpOnly cookie on its own server (a
backend-for-frontend), which keeps the API usable by future mobile apps.

## Sign-up says when an email is taken
`POST /auth/signup` returns 409 for an existing email. That reveals the email
has an account, but hiding it would mean a confusing sign-up flow for real
users. Sign-in and password reset don't leak: sign-in gives one message for
both failures and verifies against a dummy hash for unknown emails, and
forgot-password always returns 202 without awaiting the email send. Rate
limiting ([[Rate limiting]]) covers enumeration by brute force.

## Seed data lives in migrations
The starting categories are inserted by the migration that creates the table,
with fixed ids and `ON CONFLICT DO NOTHING`. Every deployment, including the
e2e database, gets them from `prisma migrate deploy` alone; there's no
separate seed script to forget. Admins can rename and reorder them later.

## Roles come from the database, not the token
`RolesGuard` reads the role that `JwtAuthGuard` loaded from the database on
this request, not the `role` claim in the JWT. Promoting or demoting an admin
takes effect on their next request instead of when their token expires.

## All fees are public
`GET /config/fees` publishes every fee, including the withdrawal fee, with no
auth. Hidden withdrawal fees were a gap in the competitors we studied; being
open about money is the product.

## Campaign slugs: title plus a random suffix
`help-ada-finish-nursing-school-k7m2q`: readable enough to say out loud, and
the 5-character suffix (no 0/o, 1/l/i) makes slugs unguessable and lets two
campaigns share a title. The slug is fixed at creation so shared links never
break when a creator edits the title.

## 404, not 403, for campaigns you can't see
Another user's campaign, or an unpublished one, answers 404 to reads and
writes alike. A 403 would confirm the campaign exists, and drafts can hold
sensitive stories (medical, family) the creator hasn't chosen to publish yet.

## Review locks editing; live edits don't need re-review
A campaign can't be edited while an admin is reviewing it, so the version
approved is the version published. Once live, the creator can update the
story and goal without a second review: updates are how creators show
progress, and the public money trail and reports cover abuse. The currency is
fixed at submission because donations will be held in it.

## Images upload straight to storage, then get checked
The browser `PUT`s each image to a presigned URL, so file bytes never pass
through the API (cheap to host, no upload limits to tune). Because the client
controls what it uploads, attaching an image re-reads what was actually
stored: the size from `HEAD`, and the type from the first bytes (JPEG, PNG or
WebP signatures). The claimed Content-Type is ignored. A fake (say, an SVG
with a script, labelled `image/png`) is deleted and refused. Uploads never
attached are orphans; a cleanup job comes with the job queue.

## S3 checksums only when required
AWS SDK v3 now adds CRC checksums to requests and presigned URLs by default.
A browser upload can't match a checksum computed before the file is chosen,
and S3-compatible stores (SeaweedFS here, others in the wild) answer
`BadDigest`. The client is set to `requestChecksumCalculation` /
`responseChecksumValidation: 'WHEN_REQUIRED'` so self-hosters can use any
S3-compatible store.

## Ledger signs and idempotency
Entries are signed (positive = debit, negative = credit) rather than having
debit and credit columns, so "sums to zero" is one `SUM()`. Balances are
shown in each account's normal direction: clearing (an asset) reads positive
as debits, wallets and revenue (liabilities and income) read positive as
credits, so a wallet's balance is simply what the campaign is owed.

Every posting carries an idempotency key for the business event
(`donation:<id>`). Providers deliver webhooks at least once and sometimes
concurrently; the unique key means the second delivery returns the first
transaction instead of crediting the campaign twice. Accounts are created on
first use, inside the same database transaction as the posting.

Validation (balanced, non-zero, one currency) runs before anything is
written; `integrity()` re-checks the invariants from the database so a bug or
a manual SQL edit can't hide.

## Payment adapters are opt-in, and provider wire amounts stay inside adapters

`PAYMENT_PROVIDER=disabled` keeps existing deployments and CI independent of
payment accounts. `PaymentsModule` exports null in that mode; consumers must
reject payment operations rather than simulate success. Only credentials for
the selected provider are required.

The domain uses BigInt minor units. Paystack uses minor-unit JSON numbers
(checked for safe integer precision); Bachs uses decimal strings, converted
without floating point inside its adapter. Bachs refund amounts are in the
original settlement currency, so callers must use the reconciled settlement
record. Its API does not accept a refund currency field.

Recipient creation is separate from payouts so an unapproved Bachs destination
cannot silently become a payout target. The first adapter surface supports
Nigerian bank payouts only. Unknown payment states require reconciliation;
Bachs checkout completion and accepted/overpaid amounts cannot confirm an exact
payment. Adapters do not retry writes automatically: transport failures and
malformed success responses can hide a successful write.

## Reserve checkout before external I/O, never blindly retry uncertain writes

A random UUID v4 idempotency key reserves one donation and its immutable fees
before contacting the provider. A duplicate key returns the saved checkout or
conflicts while initialization is in flight. No database transaction is held
across provider I/O. A timeout, malformed response, or interrupted initialization
requires reconciliation rather than another hosted checkout creation. The key
is hashed in the database and is not included in provider metadata.

Guest status reads use a separate HMAC capability returned to the checkout
caller; donation IDs alone cannot reveal payment progress or checkout URLs.
Signed-in donors are associated with their account email. Provider redirects
never change donation status.

## Payout accounts: resolved names, a 24-hour hold, and an email
The account name always comes from the provider's lookup, never from what
the user types, so the name shown is the real holder of the account. A new
account can't receive withdrawals for 24 hours and the owner is emailed when
one is added: the classic takeover is "steal a login, add your own account,
withdraw", and the hold plus the email gives the real owner a day to notice.

`nameMatchesProfile` needs two full name parts shared with the user's name
(order-free, accents and punctuation ignored, initials don't count), or one
part for a genuinely one-word name. "A Obi" doesn't match a bare "OBI"
account, which could be any relative. It's advisory until
[[Identity verification]]; withdrawals will then require a match against the
verified name or an admin override.

## PostgreSQL is the payment event outbox; Redis is the delivery mechanism

Persist a verified event before enqueueing it. A crash between those writes or
Redis data loss must not lose a successful payment, so a recovery scan requeues
unprocessed database rows. Queue payloads carry only the event row ID. Workers
use row locks and the ledger's transaction-aware posting method to commit the
payment state, balanced entries and event outcome together. Redelivery cannot
credit a campaign twice. Provider signature freshness is checked at intake;
queue delay does not invalidate an event already verified and stored.

Campaign progress reports gross donation amounts only when a committed donation
ledger posting backs them; wallet balances remain net amounts. Distinct donor
emails determine donor count. Donor processing fees use the ledger's DONOR_FEES
revenue account; actual provider expenses and settlement reconciliation remain
separate from the checkout's configured surcharge.

## Notification intents commit with settlement; ambiguous SMTP sends are held

A successful donation must not lose its receipt if the API crashes after posting
money. Its donor receipt and creator-notification item are written in the same
transaction as settlement, then claimed from a PostgreSQL outbox. Creator items
share a one-minute campaign batch until that batch is claimed and its body frozen.
A database poller is enough for this bounded mail workload and keeps recovery
independent of Redis.

SMTP cannot provide exactly-once delivery: the server may accept a message before
a disconnect or before the database can record success. Stable Message-IDs help
trace attempts but do not guarantee recipient deduplication. Retry only confirmed
temporary non-acceptance; unknown/interrupted sends require reconciliation. In
particular, Nodemailer can report ECONNECTION/CONN after DATA, so those labels
alone do not establish that retrying is safe. SMTP acceptance is distinct from
final delivery to the recipient's inbox.


## Withdrawals reserve gross funds before one claimed dispatch

The campaign row serializes wallet debit checks, reservation postings and admin
freezes. Holds move the entire requested amount from the campaign wallet into
pending payouts; the provider receives the net amount after the configured flat
fee. On confirmed success the fee becomes platform revenue. A failed hold or
explicitly reversed payout returns the full request, including that fee.
Provider transfer expenses remain separate from the configured platform fee.

The destination, fees and owner-scoped UUID key are immutable snapshots. Dispatch
is claimed once outside the reservation transaction; no transaction stays open
across the provider call. Interrupted initialization and ambiguous writes retain
the hold and are never automatically resent. Matching signed webhooks can bind
a provider ID even if the create response was lost. A successful create response
alone does not mark the payout delivered. Conflicting terminal events need
operator review instead of another automatic ledger movement.

A freeze blocks new reservations, not payouts already accepted and held.
Initial support is NGN-to-Nigerian-bank only, with the existing verified-email,
provider-approval and 24-hour bank hold gates. Profile name matching remains
advisory until the identity-verification feature supplies a verified-name gate.
The money trail exposes financial snapshots without bank or account identities.


## Campaign YouTube links, loaded on request

Store a canonical single-video watch URL instead of user-supplied embed HTML.
Only supported YouTube hosts and an 11-character ID are accepted. The public app
constructs the fixed youtube-nocookie.com embed URL itself, without arbitrary
parameters or a server-side URL fetch. It uses the campaign's own cover as the
poster, so no YouTube thumbnail, script or iframe loads before the visitor clicks.

The native YouTube player retains controls, captions, fullscreen and keyboard
support. Autoplay is not enabled. Switching to photos unmounts the iframe and
stops playback. A direct YouTube link remains visible because URL syntax cannot
guarantee a video exists or allows embedding. New campaign/video keys reset the
loaded state when navigating between campaigns.

## Google sign-in: ID tokens only, linked by verified email
The browser gets a Google ID token (One Tap or the button) and the API verifies
it against Google's published keys, the issuer and our `GOOGLE_CLIENT_ID`. No
OAuth code exchange, so no client secret is stored anywhere. An existing
account with the same email is linked only when Google says the email is
verified; a second Google account for an already linked email is refused
rather than silently swapped. The web app keeps the refresh token in an
httpOnly cookie and talks to the API from route handlers, so browser code never
holds a token. The client ID reaches the web app through `GET /config/site`, so
it's configured once, in the API's env.

## Web sessions: two httpOnly cookies, refreshed in proxy.ts
The web app never hands tokens to browser code. `openraise_session` holds the
refresh token (plus name and email for the header); `openraise_access` holds
the access token and expires a minute early. Before a dashboard page or
dashboard API route runs, `proxy.ts` swaps an expired access token for a new
pair and passes the new cookies to both the browser and that render, since
pages can't set cookies while rendering. Mutations are server actions that
call the API with the access token; photo uploads go through a route handler
that uploads to storage itself, so storage needs no CORS setup.

## Concurrent refreshes are not theft
Refresh tokens are single use, and reusing a spent one revokes the whole
sign-in. With server-side refresh, two requests can legitimately refresh at
once (two tabs, a page and a background fetch). A token spent within the last
30 seconds while its sign-in still has a live token gets a `REFRESH_RACE` 401
instead: no tokens are issued, nothing is revoked, and the web app retries
with the cookies the winning request set. Reuse after that window still signs
every device out.

Claiming the spent token and creating its replacement happen in one
transaction (#40). Otherwise the losing request could look for a live token
before the winner had written one and treat the race as theft.

## Creators see supplied preferences, never donor email
The creator dashboard lists each confirmed donation's amount, fees and date,
and exports those financial fields as CSV. Donor messages (#29) add optional
names and messages to the private view. Checkout explains that the organiser
can see a supplied name, while anonymous giving hides it from other visitors.
Public rankings remain anonymous so public and private gifts are not linked.

Donor email stays private: the receipt address is not permission to contact
someone. Campaign update emails (#30) require separate explicit consent and
are dispatched by the platform, without handing donor email to the creator.

## Engagement emails require explicit campaign-specific consent

Receipt email is required for payment recovery; it is not consent to campaign
updates. Checkout defaults update emails off. A successful ledger-backed
payment creates consent in the same transaction as settlement. Fan-out considers
only subscriptions already created when a post was published, so delayed payment
settlement does not backfill old posts. Duplicate and older settlements cannot
reverse an unsubscribe; a later explicit opt-in donation can resubscribe.

Posts themselves are durable fan-out work, scanned in locked batches of 100
subscriptions. Delivery rows have per-update/per-subscription dedupe keys.
Eligibility is checked again when an email is claimed. An unsubscribe or
removal cancels pending deliveries but cannot revoke a message already in SMTP.
Unknown acceptance remains UNCERTAIN and requires the existing operator review.
Email scanners cannot unsubscribe with a GET: the capability stays in a fragment,
and the web page requires an explicit confirmation POST.

Published updates are immutable; corrections use a new post or soft removal.
A still-valid upload URL must not modify a published photo. Publication copies
uploads into separate server-owned keys, checks the copy's actual size and magic
bytes, and attaches only those immutable keys. The existing orphan-upload cleanup
follow-up also applies to unused update uploads.

## Publishing decisions are versioned and attributable

The admin browser sends the exact campaign version it inspected. A conditional
status/version update and a review-history insert share one transaction. This
prevents two reviewers from both deciding and prevents an old browser tab from
approving a later resubmission. Unknown responses require a reload rather than
assuming failure. Legacy API routes remain compatible and share the audit path,
but only the new endpoint requires a browser version snapshot.

Administrators cannot review their own campaign. A passed campaign end date must
be corrected before approval. Returning a campaign uses the existing REJECTED
state and creator-visible reason rather than adding a second changes-requested
state. Reviewers see email verification separately from identity verification;
this dashboard does not introduce KYC or automatic publication.

## Reports are private allegations; restrictions require a recorded decision

Reporting needs no account or email. Store only category/details and a request
hash, expose no public report lookup, and do not auto-pause based on volume.
An admin records a reasoned action after inspecting campaign context. Notes are
plain text, and the reporter's full allegation is not sent to the organiser.
Pause/freeze reasons are deliberately shared with the organiser and the UI warns
the reviewer not to copy private report details into them.

An admin pause is separate from the creator's PAUSED status. Owners cannot
resume through it; lifting the restriction keeps donations paused until the
creator resumes. Closing a report does not lift restrictions. Payout freezes
share the reservation campaign lock and existing freeze-event history, preserving
the existing rule that already-held/dispatched payouts may complete.

Moderation is atomic and versioned against both report and campaign, with an
attributable action record. Admins cannot moderate their own campaign. Unknown
responses must be reconciled by reloading current state rather than assuming
failure or blindly creating another action.

## Identity verification gates going live and getting paid

There is no "disabled" KYC setting. The default provider, `manual`, needs only
the storage every deployment already has: the creator uploads a photo of their
ID and an administrator compares it with what they entered. Vendor adapters
(QoreID, Dojah, Smile ID) slot in behind `KycProvider` later.

Verification is required to submit a campaign and checked again when an admin
approves one, so a campaign can't go live for someone unverified. Campaigns
already live stay up, but every withdrawal needs a verified identity and a
payout account whose bank-resolved name matches the verified name (the same
`namesMatch` rule as before, now against the reviewed name instead of the
profile name). An admin override for genuine mismatches is not built yet.

The reviewer confirms the name as printed on the ID; that, not what the creator
typed, is what payouts must match. Admins can't decide their own check.

Only the last four characters of an ID number are stored. Storage buckets
usually serve files publicly (campaign photos live there), so ID photos are
encrypted with AES-256-GCM before they are written, with the storage key bound
in so a file can't be moved to another person. The API streams decrypted bytes
to admins only, uncached. The key comes from `KYC_ENCRYPTION_KEY`, or is
derived from `JWT_SECRET` so existing installs keep working; deployments
should set their own. Declined photos are deleted; verified ones are kept as
evidence for fraud investigations until a retention policy is decided.

## Limits follow verified ingress identity and share atomic Redis counters

The Next.js BFF's socket is not the visitor. A deployment-selected single-IP
header, overwritten by a trusted ingress, is signed by the web server using a
shared relay secret; arbitrary unsigned headers never choose a bucket. Direct
API proxy chains are trusted only through configured CIDRs, traversed backwards
until the first untrusted address. Incorrect ingress configuration cannot be
made trustworthy by header parsing, so deployment prerequisites are explicit.

Redis checks all network/account/email buckets before incrementing any and never
extends an exhausted window on rejection. This makes decisions atomic across
replicas and avoids consuming an unrelated allowance when another bucket blocks.
Key identities are HMACs and expire. IPv6 /64 grouping limits rotating-address
bypasses. Failed Redis checks block selected expensive/sensitive requests briefly;
webhook settlement, health and payment-status recovery must remain available.

## Admin money inspection is read-only and grounded in postings

The money workspace separates visibility from operational authority. It exposes
exact ledger-derived amounts and provider references, without a button that can
replay money, mark a payout paid or create an adjustment. Those workflows need
separate evidence and action controls. Existing moderation handles payout freezes;
the money page shows recent freeze history without adding a second write path.

Account balances use the ledger's normal debit/credit sign and keep currencies
separate. They are not bank balances or proof of provider cash. Campaign wallet
balances include reservation postings and do not imply payout eligibility.
Summary integrity is checked in a repeatable-read snapshot. Per-record screens
refresh current source state and may change as background settlement proceeds.

Queue definitions are explicit and type-specific. Do not classify an ordinary
abandoned checkout as lost money. The withdrawal predicate is shared with the
existing backend review queue. Provider event payloads and donor identity stay
private even in this dashboard; only selected investigation fields are returned.
