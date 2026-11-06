# Audit log verification

2026-11-06. Branch feat/audit-log. Fictional loopback preview API 4410 and Next
3500; no real account, donor, bank or identity details used in browser captures.

Final checks exited 0: pnpm lint, pnpm typecheck, pnpm test (173 tests),
pnpm test:e2e (207 tests, including eight audit cases), pnpm build (shared/API/web).
A separate empty temporary database accepted all migrations. Its primary key and
five audit indexes were present; an unattributed role update produced exactly the
expected redacted before/after event. The temporary database was then removed.

Audit tests cover current-role authorization (anonymous/user/demoted admin), input
bounds and valid date ranges, review/freeze/identity/moderation actor attribution,
bank addition/default/removal, snapshot privacy, transaction rollback, no-op
suppression, connection context clearing, exact ID/action/day filters, pagination,
read-only reads and rejection of UPDATE/DELETE/TRUNCATE. Initial fixture attempts
omitted a required identity decision timestamp and used a report allegation below
the existing minimum length. Constraints rejected both; corrected fixtures and
the final full suite passed without weakening any source constraint.

Browser review: desktop 1440x1000 and mobile 390x844, reduced motion. Inspected
screenshots of normal and expanded comparisons, plus loading, empty, unavailable
and permission states. No horizontal document overflow. axe WCAG2 A/AA and 2.1 AA
reported zero violations on both viewports with comparisons open. Enter toggles
native details, and keyboard focus uses the existing visible 3px solid outline.
Filtering action type, exact record references, invalid date ranges, page 2 and
newer-page navigation were exercised. Unattributed role events are labelled.

This introduces a migration: deploy migrations before the new application build.
Logging begins at installation; historical events are not reconstructed. Role
changes have no app management workflow yet and direct maintenance is unattributed
unless an operator deliberately provides transaction context. No raw notes,
account numbers, names, emails, identity documents, provider secrets or tokens are
copied. Database owners can disable triggers; no external tamper-proof archive is
claimed. Pagination is live and concurrent arrivals can shift page boundaries.
