---
status: in-progress
branch: feat/rate-limiting
type: feature
area: ops
milestone: 8
priority: 3
effort: S
tags:
  - feature
---

# Rate limiting

Redis-backed throttling on auth, checkout, reports and AI endpoints. Captcha
(Turnstile or hCaptcha, optional) on sign-up and reports.

## Implementation

Redis-backed atomic fixed windows now cover sign-in, signup, account recovery,
refresh, donation quotes/checkout, public reports, identity submissions/document
uploads and campaign photo upload writes. A policy hook is ready for future POST
AI endpoints. Network identities are hashed; authenticated accounts and sign-in/
recovery email targets also have shared counters.

The web server can relay a signed verified address from a deployment-selected,
ingress-overwritten header. Unsigned forwarding is ignored by default; exact
trusted API proxy CIDRs are opt-in. See [[Rate limiting deployment]] for required
BFF configuration and defaults. IPv6 shares /64 buckets. Redis failure blocks
protected writes briefly with retry guidance; payment webhooks/status and health
are exempt. Optional CAPTCHA remains a separate follow-up.

Validation and local proxy smoke checks: `output/rate-limiting/verification.md`.
