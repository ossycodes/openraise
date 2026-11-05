---
status: shipped
type: feature
area: payments
milestone: 2
priority: 1
effort: M
branch: feat/ledger
pr: 9
shipped: 2026-11-05
tags:
  - feature
---

# Ledger

Double-entry accounts: provider clearing, campaign wallet (one per campaign and
currency), platform revenue, pending payouts, fees paid to providers. Every
posting is a `LedgerTransaction` with entries that sum to zero, written in one
DB transaction. Balances are sums over entries. A nightly check reconciles
ledger totals with provider settlement reports.

## Accounts

| Type | Kind | Holds |
|---|---|---|
| `PROVIDER_CLEARING` | Asset | What payment providers have collected for us and not yet paid out |
| `CAMPAIGN_WALLET` | Liability | What we owe a campaign, per currency |
| `PENDING_PAYOUTS` | Liability | Withdrawals requested, not yet confirmed (used by [[Withdrawals]]) |
| `PLATFORM_REVENUE` | Revenue | Platform fees |
| `DONOR_FEES` | Revenue | Processing fees donors paid on top |

## A donation

₦50,000 with default fees (donor pays ₦50,850):

| Account | Entry | Balance effect |
|---|---|---|
| `PROVIDER_CLEARING` | +₦50,850 | provider holds ₦50,850 more |
| `CAMPAIGN_WALLET` | −₦48,250 | campaign is owed ₦48,250 more |
| `PLATFORM_REVENUE` | −₦1,750 | |
| `DONOR_FEES` | −₦850 | |

## As built

- `LedgerService.post()` (global): validate, then write accounts, transaction
  and entries atomically; idempotent by key, safe under concurrent replays.
- `balance()`, `campaignBalances()`, `integrity()`.
- `donationEntries()` in `ledger.entries.ts`, built from the shared fee
  breakdown so the ledger and the donate form agree.
- Signs and idempotency: [[Decisions#Ledger signs and idempotency]].
  Tables: [[Data model#Ledger]].
- Not yet: withdrawal postings ([[Withdrawals]]), refunds, the nightly
  reconciliation against provider settlements, admin ledger views
  ([[Admin console]]), the [[Public money trail]].
