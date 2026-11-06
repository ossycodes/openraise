---
status: in-progress
branch: feat/identity-verification
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

## Still to do

- Part 2: vendor adapters (QoreID, Dojah, Smile ID) with NIN/BVN lookup and
  selfie match where supported.
- Admin override for a payout account whose name genuinely differs.
- A retention policy for verified ID photos.
