---
status: shipped
pr: 19
shipped: 2026-11-05
branch: feat/withdrawals
type: feature
area: payouts
milestone: 3
priority: 2
effort: M
tags:
  - feature
---

# Withdrawals

On-demand withdrawal of a campaign wallet's available balance, any time, even
before the goal is reached. Ledger hold on request, provider payout with an
idempotency key, settle on success, reverse on failure. Withdrawal fee shown up
front. Admins can freeze payouts per campaign. Every withdrawal appears on the
[[Public money trail]].


## Implementation on feat/withdrawals

Owner fee quote, expected-fee confirmation, immutable masked destination snapshot,
one claimed provider dispatch, balanced hold/settlement/reversal postings, private
paginated history and status reads. Available balance is derived from the ledger;
concurrent requests serialize on the campaign row. NGN bank payouts only for now.
Bank ownership, provider approval, currency and the 24-hour hold are enforced.

Signed Paystack/Bachs events settle payouts. Duplicate events cannot move money
twice; Paystack reversals return even an already-settled payout. Unknown outcomes
retain their hold. Admins have an audited campaign freeze and reconciliation
review queue. Public withdrawal history omits all destination and provider data.
See [[Withdrawal reconciliation]], [[API]] and [[Data model]].

The creator dashboard and full public money-trail UI remain separate features.
Live sandbox payout verification remains required before enabling real payouts.
