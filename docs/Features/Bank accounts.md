---
status: shipped
type: feature
area: payouts
milestone: 3
priority: 2
effort: M
branch: feat/bank-accounts
pr: 12
shipped: 2026-11-05
tags:
  - feature
---

# Bank accounts

Creator adds a payout bank account: bank picked from the provider's bank list,
account number, name resolved by the provider. The resolved name must match
the KYC-verified name (fuzzy match, admin override). Changing the account
triggers an email and a 24-hour payout hold.

## As built

- Endpoints: [[API#Payout bank accounts]]. Table: [[Data model#BankAccount]].
- Name from the provider's lookup; payout recipient created at the provider
  with an idempotency key; only the last 4 digits ever leave the API.
- Every new account: 24-hour hold (`payoutsAvailableAt`) and an email to the
  owner. Why: [[Decisions#Payout accounts: resolved names, a 24-hour hold, and an email]].
- `nameMatchesProfile` against the user's name for now (two full name parts);
  binding once [[Identity verification]] ships.
- One default, max five, soft removal (the next account becomes default).
- 503 with payments disabled, 502 on provider failure (no provider details).
- Tests use `FakePaymentProvider` via `createTestApp({ paymentProvider })`.
- Not yet: admin override for mismatched names ([[Admin console]]), enforcing
  the hold and name match at withdrawal time ([[Withdrawals]]), Ghana and
  Kenya payout destinations.
