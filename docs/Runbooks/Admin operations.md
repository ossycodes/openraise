---
title: Admin operations
tags:
  - runbook
  - admin
---

# Admin operations

The admin workspace now includes Users, Categories, Branding & fees, campaign
controls and reconciliation actions. Apply the admin-operations migration and
regenerate Prisma before starting the API. No provider credentials are exposed
or editable through this workspace.

All reads require administrator access. Browser mutations use the server's
httpOnly access cookie, require a same-origin request and forward to an explicit
allowlist of API operations. Mutations record actor and reason. Record timestamps
(or the settings revision) prevent overwriting an intervening change.

## Accounts and campaigns

Users can be searched by name/email. User details omit password hashes, provider
subjects, tokens and authentication metadata. Administrators may grant/revoke
administrator access or end another person's sessions. A role change also ends
sessions; access-token versions are incremented and refresh tokens revoked in
the same transaction. Refresh rotation serializes against this operation.

An administrator cannot change their own access. Role mutations serialize under
a database advisory lock and recheck the acting administrator, preserving at
least one administrator even for simultaneous cross-demotions. An account must
have a verified email before receiving administrator access. Ending sessions is
not an account ban: the person can sign in again.

Published campaign controls allow featuring/unfeaturing, pause/resume/end and
payout freeze/unfreeze. An administrator cannot manage their own campaign.
Featuring requires a live, unexpired campaign. Pausing removes it from featured
and blocks creator resume until an administrator lifts the moderation pause.
Ending is permanent; freezes still allow an administrator to inspect and
reconcile money already sent. A new payout or retry honours the freeze.

Category names, descriptions and ordering can be managed without changing their
public slugs. Creation and edits are audited. The admin editor sends the last
seen timestamp; older category clients remain compatible without one.

## Branding and fees

`DeploymentSettings` holds one public settings snapshot with an integer revision.
Until it exists, settings come from environment defaults. Once saved, the stored
snapshot takes precedence for every API instance; no process-local cache or
restart is required. Concurrent saves require the current revision.

Editable settings are site name, logo URL (HTTP/S), accent colour, support email,
platform and donor fee percentages, flat donor fee/threshold, and withdrawal
fee. Browser forms convert percentages to integer basis points and currency
amounts to minor-unit strings. Calculations remain BigInt and validate limits.
Default campaign currency, provider credentials and SMTP transport stay in env.
Flat amounts use the deployment's existing fee policy for each campaign currency;
this change does not introduce conversion or per-currency fee schedules.

New quote/checkout/withdrawal computations read the shared settings. An existing
checkout replay keeps its original snapshot, and a withdrawal request with a
changed fee requires a new quote. Already-created donations/withdrawals are not
rewritten. The donation panel reviews a changed charge before handing off to a
hosted checkout. Email templates receive the saved site name when generated;
already-queued notifications retain their original copy.

## Reconciliation and payout retry

Use Money operations → Reconciliation. The default view shows exceptions; the
withdrawal filter also lists failed/returned payouts so an operator can inspect
a retry candidate. Read the reference, IDs, amounts, ledger links and destination
context before submitting a reasoned action.

- **Verify payment:** reads the selected provider's authoritative payment result.
  Only a successful result with the exact stored reference, amount, currency
  and (when present) payment ID can settle. It creates a durable verification
  event and uses the ordinary settlement processor and notification outbox.
  Replays do not create another ledger credit or receipt.
- **Verify payout:** Paystack looks up the merchant reference; Bachs retrieves
  the stored payout ID. Reference, net amount, currency, destination ID and any
  already-known payout ID must match. Pending stays pending; confirmed success,
  failure or reversal uses the existing balanced settlement/return posting.
  A provider outage, 404, missing Bachs payout ID or unknown status never proves
  failure. Conflicting final states require investigation.
- **Retry returned payout:** first confirms provider failure/reversal. The local
  attempt must already be failed/reversed with its return posting recorded and
  no reconciliation flag. A new attempt links to the original via unique
  `retryOfId`; concurrent/repeated retry requests reuse that successor. Its new
  hold and provider dispatch pass the existing identity/name/account/24-hour
  hold, currency, balance, freeze and fee checks. A changed fee requires the
  creator to make a new withdrawal. An ambiguous new dispatch stays uncertain;
  it is never automatically resent.
- **Reprocess event:** reruns a supported, previously authenticated stored event
  through the ordinary amount/currency/reference and ledger checks. Successful
  events cannot be reprocessed; no amounts, types or references are editable.

Provider lookup I/O occurs outside database transactions. After evidence arrives,
the service locks and rechecks the record version before applying financial
state. Reconciliation endpoints are rate limited. No arbitrary balance edits,
manual settlement overrides or general ledger adjustments are introduced.

Provider lookup contract tests use synthetic examples from
[Paystack transfer verification](https://paystack.com/docs/api/transfer/) and
[Bachs payout retrieval](https://docs.bachs.io/api-reference/payouts/get-payout),
reviewed 2026-11-13. Credentialed sandbox smoke tests remain necessary before
using payment providers for real funds.

## Verification

Integration coverage includes authorization, redacted user reads, stale changes,
role/session revocation, concurrent cross-demotions, campaign transitions,
category audit records, settings shared between app instances, exact prospective
fees, original payout fee snapshots, matching/mismatched provider evidence,
provider outages, idempotent donation credit/receipt, one concurrent payout retry,
freeze/fee retry guards and stored-event reprocessing. Browser evidence is in
`output/admin-operations-*.png`.


Local verification on 2026-11-13: lint, type checks, production build and all
200 unit tests passed. The full end-to-end run passed 256 tests; the final
focused admin run passed 16 tests, including revocation during provider lookup
and own/other-account management permissions. Authenticated browser checks
covered users/detail, categories, settings, audit filtering and returned-payout
listing at desktop and mobile widths with no horizontal overflow. A saved
₦51.25 withdrawal fee was confirmed as 5125 minor units. Original local settings
were restored and the temporary QA account/session removed after verification.
