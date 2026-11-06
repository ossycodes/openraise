# Reports and moderation verification

2026-11-06. Fictional loopback fixtures on API 4406 and Next 3460. No real
campaign was reported, paused or frozen in browser tests. Reduced motion used.

- Desktop queue/detail at 1440×1000, mobile queue and controls at 390×844;
  no horizontal overflow. Screenshots inspected locally.
- Public form has no login/email requirement. Simulated 503 locks the draft;
  Retry same report sends identical body and UUID key, then confirms receipt.
- Moderation delayed POST shows disabled Recording action… controls. Pause and
  freeze succeed, then resolve preserves both restrictions. Creator view explains
  the restriction and hides Resume donations.
- Stale 409 retains action reason and offers reload. Empty search, API error,
  media fallback with allegation retained, non-admin denial and signed-out
  signin redirect verified.
- axe WCAG 2 A/AA + 2.1 AA: zero violations on moderation detail and the public
  reporting form. This supplements manual inspection, not a full a11y guarantee.
- Nine API cases exercise guest idempotency, validation/public-state gates,
  privacy and role boundaries, creator-resume protection, explicit lifting,
  existing freeze audit, closing without release, concurrent/stale actions,
  atomic rollback, self-moderation restrictions, pagination and current roles.

Exit code 0: lint, typecheck, 162 unit tests, 164 database e2e tests and both
production builds. General intentional-spam throttling is a separate roadmap
feature; idempotency only addresses retry duplication. No report attachments,
notification emails or automated fraud decisions are introduced.
