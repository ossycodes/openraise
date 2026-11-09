---
status: shipped
pr: 55
shipped: 2026-11-09
branch: feat/qr-posters
type: feature
area: growth
milestone: 6
priority: 3
effort: S
tags:
  - feature
---

# QR codes and posters

Follow-up to [[Share kit]], for offline sharing at churches, mosques, offices
and schools.

- A short link per campaign (e.g. `/c/k7m2q` from the slug suffix) that
  redirects to the campaign page.
- A QR code of the short link, downloadable as PNG and SVG.
- A printable A4 poster: cover image, title, goal and progress, QR code and
  short link, with print styles.

## Implementation

- Short links: `/c/<code>` on the web redirects to the campaign through
  `GET /short-links/:code`. Codes are stored in `Campaign.shortCode`; see
  [[Decisions#Short codes are stored, not read off the slug]].
- QR codes: `/campaigns/<slug>/qr` (PNG, 1200px) and `?format=svg`; add
  `download=1` to save. They encode the short link.
- Poster: `/campaigns/<slug>/poster`, with print and QR download buttons; one A4
  sheet in print, totals dated "as of" the print day.
- The share dialog has a "Share it offline" row with the short link, poster and
  QR code.
