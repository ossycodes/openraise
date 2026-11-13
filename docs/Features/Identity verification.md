---
status: shipped
branch: feat/kyc-vendor-adapters
pr: 62
shipped: 2026-11-13
type: feature
area: trust
milestone: 4
priority: 2
effort: L
tags:
  - feature
---

# Identity verification

`KycProvider` interface with adapters for QoreID, Dojah and Smile ID, plus a
`manual` adapter (admin reviews an uploaded ID) for deployments without a KYC
contract. NIN (and optionally BVN) lookup, selfie match where supported.
Verified name, date of birth and status stored; raw ID numbers stored
encrypted or not at all. Verification is required before a campaign can be
published or a withdrawal made.

## Part 1: manual verification

- `KycProvider` interface (`KYC_PROVIDER`, default `manual`) and the manual
  adapter: the creator sends ID type, number, legal name, date of birth and a
  photo of the ID; an administrator verifies or declines it.
- Only the last four ID characters are stored. ID photos are AES-256-GCM
  encrypted before storage and only shown to admins; declined photos are
  deleted. See [[Decisions#Identity verification gates going live and getting paid]].
- Gates: submitting a campaign, approving one, and every withdrawal. Payout
  accounts must match the verified name.
- Web: `/dashboard/verification`, prompts on the dashboard, campaign and money
  pages; admin "Identity checks" queue and detail with the photo; identity
  status on the campaign review page. Decision emails to the creator.
- API: see [[API#Identity verification]].

## Payout name reviews and ID photo retention

- A creator whose bank shows another name (married, reordered, shortened)
  explains it from the payouts page; another administrator approves or
  declines it from "Payout names" in the admin workspace. An approval covers
  that one account for the current verified name, and withdrawals honour it.
  See [[Decisions#Payout name overrides are per account and per verified name]].
- Verified ID photos are deleted `KYC_DOCUMENT_RETENTION_DAYS` (default 365)
  after the decision, and unsubmitted uploads after a day, by an hourly sweep.
  See [[Decisions#ID photos are deleted on a schedule, tracked by the database]].
- Both are recorded in the [[Audit log]]; the sweep as an automatic actor.

## Part 2: vendor adapters (#62)

- QoreID and Dojah: NIN/BVN lookup, required selfie match, authority name and
  date-of-birth matching. Missing evidence never verifies a creator.
- Smile ID v3 Enhanced KYC: explicit consent and configured privacy notice,
  async submission, custom correlation reference, vendor signature plus a
  private per-check callback token. This product does not perform face match.
- Pending checks are reserved before vendor dispatch to prevent concurrent
  paid checks and callbacks arriving before their local row. Ambiguous failures
  stay pending for administrator reconciliation; automatic retry is disabled.
- Creator form shows supported identity types and required selfie/consent.
  Existing manual review and encrypted-photo retention remain available.
- Contract tests use synthetic documentation-shaped responses, not sandbox
  recordings. Integration tests exercise consent, encrypted selfie delivery,
  concurrency, uncertain outcomes, early/duplicate callbacks and mismatches.

## Still to do

- Run the credentialed sandbox checklist for each provider in [[KYC vendors]].
- The code shipped in #62; provider enablement remains conditional on the
  deployment completing its credentialed sandbox checks.
