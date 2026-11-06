# Rate limiting verification

2026-11-06. New worktree/branch; existing app and user env left unchanged.

Real Redis e2e cases: invalid/case-variant sign-in throttling; signed visitor
separation; spoofed forwarding rejection; IPv6 /64 grouping; verified account
limits across networks; email target limits across networks; report/checkout
scope across slugs and request keys; failure handling with health/webhooks/status
exemptions; actual window expiration; atomic concurrency across two API instances;
HMAC-only expiring Redis keys. Ten e2e cases, plus five address/proxy unit cases.

The final broad suite passed 184 database e2e tests. Lint, typecheck, 173 unit
tests and both builds passed. The focused suite checks all ten rate-limit cases,
including rejecting a raw KYC image stream after the identity allowance is exhausted. Other e2e suites override the limiter to avoid
interference, while limiter tests explicitly enable real shared counters.

Browser-backed Next proxy smoke test used fictional loopback responses on API
4407 / web 3470, with an explicit fake trusted header and test-only shared secret.
Reports, checkout, Google sign-in, KYC document upload and photo upload all relayed
canonical IPv6/IPv4 addresses with valid method/path/time signatures and returned
429 with Retry-After: 12. Missing selected ingress identity failed with 503.
Testing caught and corrected a photo-upload response dropping Retry-After.

There is no visual redesign. Production ingress configuration is documented but
not exercised against an external deployment. CAPTCHA remains optional follow-up.
