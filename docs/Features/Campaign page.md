---
status: shipped
pr: 14
shipped: 2026-11-05
branch: feat/public-campaign-page
type: feature
area: web
milestone: 5
priority: 2
effort: M
tags:
  - feature
---

# Campaign page

Server-rendered for SEO and fast link previews: cover, story, progress bar,
raised / goal / donors, verified badge, organiser, updates, donations feed,
share buttons, donate form with live fee breakdown, report link. Open Graph
image generated per campaign.

## Current implementation

Public server-rendered campaign detail, image gallery, story, organiser, progress,
privacy-safe confirmed supporter feed, sharing and generated Open Graph image.
Warm editorial design with self-hosted fonts, responsive desktop/sidebar and
mobile donation action. Guest checkout includes exact server-calculated fees,
optional platform fee coverage, email validation and hosted payment handoff.
Private payment status is kept in an HttpOnly cookie; pending requests retain
one idempotency key across refreshes. Redirects never mark payments successful.

Verification badges, campaign updates and reporting remain dependent on their
backend features and are not represented by simulated controls in this page.

Research: [[Public campaign UI 2026-11]]. Screenshots and browser verification:
`output/campaign-ui/`. Preview instructions: `apps/web/dev/README.md`.

Recent and top contributor panels are shown separately. Top contributions combine
confirmed giving by normalized supporter email without returning that email or
any other donor identity to the browser.
