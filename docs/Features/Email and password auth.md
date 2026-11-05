---
status: shipped
type: feature
area: auth
milestone: 1
priority: 1
effort: M
branch: feat/email-password-auth
shipped: 2026-11-05
tags:
  - feature
---

# Email and password auth

Sign up, sign in, sign out. Short-lived JWT access token + rotating refresh
token (stored hashed, revocable). Email verification and password reset with
single-use, hashed, expiring tokens. Roles: `USER`, `ADMIN`.

Reset and resend endpoints always return the same response so they can't
reveal which emails have accounts.

## As built

- Endpoints: [[API#Auth]] and [[API#Users]]. Tables: [[Data model#Auth]].
- scrypt instead of argon2: [[Decisions#scrypt, not argon2]].
- Refresh rotation with reuse detection and `tokenVersion` sign-out-everywhere:
  [[Decisions#Tokens: short JWT + rotating refresh token]].
- Verify links last 24 hours, reset links 1 hour; a new link replaces older
  unused ones. Resetting a password also marks the email verified.
- `JwtAuthGuard` + `@CurrentUser()` are global, ready for campaigns.
- Email over SMTP (Mailpit locally) via `MailService`; tests swap in
  `FakeMailService`.
- Not yet: roles guard (arrives with the [[Admin console]]), rate limiting
  ([[Rate limiting]]).
