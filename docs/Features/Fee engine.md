---
status: shipped
type: feature
area: payments
milestone: 1
priority: 1
effort: S
branch: feat/fee-engine
shipped: 2026-11-05
tags:
  - feature
---

# Fee engine

One pure function in `packages/shared` used by both the donate form and the
API: given an amount, currency and the deployment's fee config, return the
platform fee, donor processing fee (percentage + flat fee above a threshold),
total charged to the donor, and net to the campaign. All in integer minor
units with explicit rounding rules.

Config: `PLATFORM_FEE_BPS`, `DONOR_FEE_BPS`, `DONOR_FLAT_FEE`,
`DONOR_FLAT_FEE_THRESHOLD`, `WITHDRAWAL_FEE`. Fully unit-tested, including
edge cases at the threshold and on tiny amounts.

## As built

- `packages/shared/src/fees.ts`: `computeDonationFees`, `computeWithdrawal`,
  `percentOf`, `validateFeeConfig`, `DEFAULT_FEE_CONFIG`.
- `packages/shared/src/money.ts`: `formatMoney` (exact, via decimal strings)
  and `toMinorUnits` (parses what donors type).
- API: `FeesService` (global) reads the env; `GET /config/fees` publishes the
  config. See [[API#Config]].
- Rounding and the "donor covers the fee" rule: [[Decisions#Fee rounding]].
