---
status: planned
type: feature
area: payouts
milestone: 3
priority: 2
effort: M
tags:
  - feature
---

# Bank accounts

Creator adds a payout bank account: bank picked from the provider's bank list,
account number, name resolved by the provider. The resolved name must match
the KYC-verified name (fuzzy match, admin override). Changing the account
triggers an email and a 24-hour payout hold.
