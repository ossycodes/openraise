---
status: in-progress
type: feature
area: auth
milestone: 1
priority: 1
effort: M
tags:
  - feature
---

# Email and password auth

Sign up, sign in, sign out. Short-lived JWT access token + rotating refresh
token (stored hashed, revocable). Email verification and password reset with
single-use, hashed, expiring tokens. Argon2 password hashes. Roles: `USER`,
`ADMIN`.

Reset and resend endpoints always return the same response so they can't
reveal which emails have accounts.
