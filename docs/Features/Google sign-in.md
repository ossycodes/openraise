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
the One Tap prompt shown to signed-out visitors in production. Automatic
One Tap is disabled during local development; `/signin` keeps the explicit
Google button available. Enabled by
setting `GOOGLE_CLIENT_ID` (a "Web application" OAuth client) in the API's env;
add every web origin to the client's Authorised JavaScript origins.

- API: `POST /auth/google` verifies the ID token and creates, finds or links
  the account. See [[API]] and [[Data model]].
- Web: `/api/auth/google` stores the session in an httpOnly cookie;
  `/api/auth/signout` revokes it. The header shows the signed-in person.
- Why it's built this way: [[Decisions#Google sign-in: ID tokens only, linked by verified email]].

Builds on [[Email and password auth]].


GIS initialization is shared across page components for a client ID. The
credential callback follows the mounted sign-in component; stale components
release their handler on unmount. Button rendering is guarded against repeated
ready callbacks and One Tap is attempted at most once per document. Expected
browser prompt cancellation is not suppressed through console/error filtering.
