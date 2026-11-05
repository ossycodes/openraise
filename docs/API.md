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
