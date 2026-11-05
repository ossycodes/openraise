---
title: Public campaign UI research
date: 2026-11-05
tags: [research, design, web]
---

# Public campaign UI research

## Evidence and resulting decisions

| Source | Observation | OpenRaise decision |
|---|---|---|
| [GoFundMe fundraising guidance](https://www.gofundme.com/c/fundraising-tips) | Descriptive titles, personal photography, cost explanations and sharing help visitors understand a fundraiser. | Put the beneficiary/story and cover first; keep organiser identity and share controls visible. Original composition and copy, not a clone. |
| [Givebutter donor flow](https://help.givebutter.com/en/articles/1726570-how-to-submit-a-donation-to-a-givebutter-campaign) | Suggested/custom amounts lead into a fee review and hosted payment choices. | Suggested amounts plus editable amount; explicit fee coverage, full charge and net amount before handoff. |
| [Givebutter forms](https://givebutter.com/donation-forms) | Progress, amount suggestions and brand consistency are core components. | Keep a progress summary adjacent to the primary donation action; use OpenRaise's own visual system. |
| [Donorbox features](https://donorbox.org/features) | Goal meters, donor walls and fee coverage are central to donation pages. | Show progress and a privacy-safe, ledger-backed supporter feed. Do not fabricate donor identities or unsupported recurring controls. |
| [Baymard guest-checkout research](https://baymard.com/research-articles/make-guest-checkout-prominent) | Account gates can obscure the guest path. This is ecommerce evidence, not a measured charity conversion effect. | Guest donation is the default; only an email is requested for the receipt. |
| [W3C form notifications](https://www.w3.org/WAI/tutorials/forms/notifications/) and [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Errors need labels, explanation and programmatic association; focus and reflow must remain usable. | Native controls/dialogs, inline errors, live feedback, keyboard completion, measured contrast and 320px reflow. |
| [[Competitive research 2026-11]] and fresh public reads of [Gathr](https://gathrhq.com/) / [Crowdr](https://oncrowdr.com/) | Regional campaigns need local currencies and visible payment context. Competitor claims are not OpenRaise capabilities. | Currency is fixed to the campaign; provider/fees come from the API. No unearned verification, guarantees or payment-method logos. |

## Checkable design contract

- Surface: public campaign detail, gallery, sharing, donation amount selection,
  email/fee review, hosted checkout handoff and provider-confirmed return status.
- Audience: Nigerian local and diaspora donors; first-time mobile visitors.
- Primary action: support this campaign. Story and progress lead; guest email and
  exact costs precede payment. Share is a secondary action.
- Direction: warm editorial, ivory paper, deep forest-green actions, restrained
  terracotta detail, DM Serif Display headings and DM Sans UI. An open-petal
  wordmark and generous image crop are the memorable details.
- Viewports: 1440x1000 desktop, 768x1024 tablet, 390x844 mobile; stress at 320px,
  200% scale/text resize, long content, RTL and reduced motion.
- Supported states: loading shell; missing campaign; upstream error with retry;
  absent image/supporters; payments unavailable; quote error; form error;
  pending/uncertain checkout; confirmed success; failed/expired payment.
- Never count a redirect as payment confirmation, expose a status capability in
  URLs/JavaScript, change a pending request's idempotency key, or claim a creator
  is identity-verified without that backend capability.
- Planned updates, reports, recurring giving and public donor identity are not
  simulated. Only available data and supported actions are shown.

## Preview asset

Built-in imagegen produced `apps/web/public/preview/ada-study.png` for the
explicitly labeled fictional preview, never as a fallback image for a real
campaign. Final prompt: “Documentary editorial photograph of a fictional Nigerian
nursing student studying in a warm sunlit university classroom, green scrubs,
open nursing textbook, a friend softly blurred in the background, natural skin
texture, wide 3:2 composition, no text, logos or watermark.” The full generation
requested a candid calm scene with the student right of center and notebooks in
the foreground. Production campaigns use their own uploaded photos. Fonts are
self-hosted Google Fonts with bundled SIL OFL licenses.

Rendered screenshots, state checks and accessibility evidence live in
`output/campaign-ui/` for review; source inspection does not replace browser tests.

## Reference-driven discovery and sharing revision

The user supplied five visual references for category pills, payment information,
a feature comparison, social sharing/download controls and contributor columns.
The revision applies these patterns to OpenRaise's own typography, palette and
copy. Categories come from the API and filter campaign results on the server.
The feature table describes current capabilities rather than making unsupported
competitor comparisons. Country-count claims, instant processing, one-hour
payouts and unimplemented AI features are not advertised. The configured platform
fee is read from `/config/fees`.

The sharing dialog previews a generated 1200×630 campaign card with the actual
cover where available. Explicit social links open compose/share pages; they do
not automatically post. The public URL excludes all query parameters. Download
returns a PNG. Missing cover images retain a branded text card. Contributor
identities remain private; the top panel aggregates confirmed giving per email
on the server and returns only amounts, currency, last confirmation and rank.

Browser verification: homepage at 1440, 768, 390 and 320px; category filtering and
empty results; share URL excludes a test payment reference; PNG download; copy
feedback; keyboard focus trap and Escape restoration. axe-core reported zero
tested WCAG A/AA violations on homepage and sharing surfaces after fixing the
category-label contrast. Updated artifacts are in `output/campaign-ui/`.
