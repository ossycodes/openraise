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
