---
title: Rate limiting deployment
tags:
  - ops
---

# Rate limiting deployment

The API uses shared Redis fixed-window counters. Protected requests fail closed
with 503 if Redis cannot make the decision; health, webhooks, sign-out and payment
status reads remain available. Ensure Redis supports EVAL/GET/INCR/PTTL/PEXPIRE,
keep it private, and use REDIS_URL credentials/TLS as appropriate. This adapter
uses a single Redis primary, not a Redis Cluster client.

## Visitor identity through the web app

The Next.js server proxies browser requests, so its socket address alone groups
visitors together. For production, configure the relay:

1. Generate a deployment-specific secret (`openssl rand -hex 32`). Set the same
   `RATE_LIMIT_RELAY_SECRET` in `apps/api/.env` and the web environment
   (`apps/web/.env.local` locally). Never prefix it with NEXT_PUBLIC_.
2. Configure `RATE_LIMIT_CLIENT_IP_HEADER` in the web environment to a header
   carrying one verified IP address. Your trusted ingress **must overwrite** this
   header, and direct access to Next.js must be blocked. A browser-controlled
   header is not a verified visitor address.
3. For nginx directly receiving visitors, an example is:

   ```nginx
   proxy_set_header X-Real-IP $remote_addr;
   ```

   Set `RATE_LIMIT_CLIENT_IP_HEADER=x-real-ip`. If nginx is itself behind another
   proxy, first configure that proxy's exact trusted networks and address handling;
   do not copy an arbitrary leftmost X-Forwarded-For entry into X-Real-IP.
4. Keep API and web clocks synchronized. The server signs method, API path,
   canonical address and timestamp; signatures older than 30 seconds are ignored.

No relay secret: the API conservatively uses the connecting proxy/socket bucket,
which can limit unrelated web visitors together. It does not trust unsigned relay
headers. With a relay secret configured, missing/invalid selected client headers
cause the web write to fail rather than inventing an address. In development,
when no client-header name is set, signed loopback is used for local testing.

## API behind an ingress

For direct API clients, `RATE_LIMIT_TRUSTED_PROXIES` accepts comma-separated exact
IP addresses/CIDRs. Default empty trusts no forwarding headers. The chain is read
from the socket backwards, stopping at the first untrusted address. Avoid blanket
networks and never use a proxy hop count. Keep direct ingress bypasses blocked.
A valid signed BFF relay takes precedence. IPv4-mapped addresses normalize to
IPv4; IPv6 visitors share a /64 bucket to limit temporary-address rotation.

## Defaults and operation

All windows default to 60 seconds (`RATE_LIMIT_WINDOW_SECONDS`, 1–86,400).
Configure per deployment based on traffic and shared networks:

| Group | Requests/window | Setting |
|---|---:|---|
| Password/Google sign-in | 10 | RATE_LIMIT_AUTH_MAX |
| Sign-up | 5 | RATE_LIMIT_SIGNUP_MAX |
| Password recovery/reset and email verification | 5 | RATE_LIMIT_RECOVERY_MAX |
| Session refresh | 120 | RATE_LIMIT_REFRESH_MAX |
| Donation quotes and hosted checkout | 30 each | RATE_LIMIT_CHECKOUT_MAX |
| Public campaign reports | 5 | RATE_LIMIT_REPORT_MAX |
| KYC document/submission, campaign upload writes | 10 per group | RATE_LIMIT_UPLOAD_MAX |
| Future POST /ai endpoints | 10 | RATE_LIMIT_AI_MAX |

Counts cover each group across campaigns, not each slug or idempotency key.
Network counters always apply; verified JWT subjects additionally share account
counters. Sign-in/recovery targets additionally share normalized email counters,
even for unknown addresses, without exposing whether an account exists. Counter
keys contain HMACs, not raw addresses/emails/tokens, and expire automatically.
Use the same `RATE_LIMIT_PREFIX`, window/limit settings and JWT_SECRET on API
replicas. Changing the JWT secret or prefix resets identity buckets. A fixed
window permits a burst on either side of its boundary; this is not a rolling
window or a WAF.

429 responses include `Retry-After` seconds and `{ code: "RATE_LIMITED", message,
retryAfterSeconds }`. The web proxy preserves the wait header and readable error.
503 uses RATE_LIMIT_UNAVAILABLE and Retry-After: 5. Redis errors are logged with
a generic, rate-bounded message; requests and credentials are not logged by the
limiter. No automatic replay of checkout or moderation writes is introduced.

`RATE_LIMIT_ENABLED=false` explicitly disables this protection. Tests normally
override the guard; dedicated e2e tests enable it and use isolated Redis prefixes.
CAPTCHA remains an optional follow-up, not part of this limiter.
