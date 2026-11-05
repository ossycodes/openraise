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
| POST | `/auth/refresh` | — | `{ refreshToken }` | 200 `AuthResult` (new pair); 401 if spent, expired or revoked |
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
₦500,000). `raisedAmount` and `donorCount` are `"0"` / `0` until donations ship.
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

## Config

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/config/fees` | — | Every fee this deployment charges (see below) |

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
