---
status: in-progress
branch: feat/public-money-trail
type: feature
area: trust
milestone: 6
priority: 2
effort: M
tags:
  - feature
  - differentiator
---

# Public money trail

Public campaign pages show ledger-backed raised funds, fees deducted from gifts,
completed net payouts, withdrawal reservations and the campaign wallet balance.
A paginated history distinguishes paid, in-progress and returned withdrawals.
Bank names, account numbers, donor identities and provider references stay private.

## Implementation

`GET /campaigns/:slug/money-trail?page=1` reads one repeatable-read snapshot for
public ACTIVE/PAUSED/ENDED campaigns. Confirmed donation snapshots require a
matching donation posting and campaign-wallet credit. Withdrawal states follow
verified reservation/settlement/reversal postings, not a mutable status flag.

Donor-covered platform fees are separate from fees deducted from campaign gifts.
Processing charges paid by donors are outside the raised total. Reversed/failed
reservations return their gross amount and retained withdrawal fees disappear
from completed totals. Other wallet changes are disclosed rather than hidden in
a forced arithmetic total. Wallet balance does not imply immediate payout eligibility.

The public section uses an expandable accounting breakdown, dated state labels,
exact amounts and older/newer history links. Its failure state leaves the campaign
story and donation controls available. No bank destination fields, operational
flags, provider references or private payer details are exposed. The pre-existing
withdrawal-history endpoint remains compatible.

Evidence: `output/public-money-trail/verification.md`. No schema migration or new
money movement is introduced. These records describe movements, not expenditure
receipts or a statement of external bank/provider cash.
