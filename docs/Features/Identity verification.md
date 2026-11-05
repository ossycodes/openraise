---
status: planned
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
