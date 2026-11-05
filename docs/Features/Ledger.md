---
status: planned
type: feature
area: payments
milestone: 2
priority: 1
effort: M
tags:
  - feature
---

# Ledger

Double-entry accounts: provider clearing, campaign wallet (one per campaign and
currency), platform revenue, pending payouts, fees paid to providers. Every
posting is a `LedgerTransaction` with entries that sum to zero, written in one
DB transaction. Balances are sums over entries. A nightly check reconciles
ledger totals with provider settlement reports.
