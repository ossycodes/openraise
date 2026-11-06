# Campaign review verification

2026-11-06. Fictional loopback preview API on port 4405 (REVIEW_PREVIEW=true),
Next on port 3450. Fixture cookies contain only fictional preview credentials;
no real campaign was approved or rejected during browser review.

- Desktop queue at 1440×1000 and mobile queue at 390×844; no horizontal overflow.
  Computed queue rows use grid, review header uses flex, and new rules apply at
  the top level. Rendering caught and fixed nested CSS left by the previous
  engagement merge; original update and donor styles were restored separately.
- Detail preview retains story/media, goal, organiser and beneficiary context.
  Shared photo/YouTube components retain their lazy loading and fallback behavior.
- Mobile decision form: required acknowledgement and rejection reason, pending
  submission disables controls; a simulated stale 409 retains the draft reason
  and offers reload. Fixture approve and return succeed and refresh history.
- Search with no matches, unavailable API error with retry, failed photo fallback
  with story retained, non-admin denial and signed-out signin redirect checked.
- axe WCAG 2 A/AA and 2.1 AA scans report zero violations on the styled queue and
  mobile rejection form. Reduced motion used for screenshots and scanning.
- Eight API cases cover current-role authorization, unpublished preview privacy,
  filtering/validation, approval history, return/resubmit stale version protection,
  concurrent reviewers, atomic rollback on audit failure, legacy auditing,
  self-review and expired campaign gates.

Checks: lint, typecheck, 162 unit tests, 155 database e2e tests, both builds.
An initial local e2e run caught a mistaken storage public URL in this worktree's
ignored .env; restored defaults and isolated database URL passed the suite.

Known limits: no identity verification, automatic approval, decision notification
emails or general audit console. Existing historical decisions have no synthetic
reviewer history. Local browser fixtures supplement real API/database tests;
they do not validate production sign-in configuration.

Regression checks after CSS repair: organiser update cards have 25px desktop
padding and image grids; donor-name controls keep their 1px border and width.
Admin dashboard entry is visible with the fixture admin role. A cross-origin
review POST is refused with 403. Final web lint/typecheck/build passed after the
CSS and error-copy changes. Evidence checker and git diff --check passed.
