---
status: shipped
type: feature
area: auth
milestone: 1
priority: 2
effort: M
branch: feat/google-sign-in
pr: 20
shipped: 2026-11-05
tags:
  - feature
---

# Google sign-in

Sign in with Google from the "Continue with Google" button on `/signin`, or from
the One Tap prompt shown to signed-out visitors on every page. Enabled by
setting `GOOGLE_CLIENT_ID` (a "Web application" OAuth client) in the API's env;
add every web origin to the client's Authorised JavaScript origins.

- API: `POST /auth/google` verifies the ID token and creates, finds or links
  the account. See [[API]] and [[Data model]].
- Web: `/api/auth/google` stores the session in an httpOnly cookie;
  `/api/auth/signout` revokes it. The header shows the signed-in person.
- Why it's built this way: [[Decisions#Google sign-in: ID tokens only, linked by verified email]].

Builds on [[Email and password auth]].
