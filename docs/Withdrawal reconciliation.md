---
title: Withdrawal reconciliation
tags: [payouts, operations]
---

# Withdrawal reconciliation

Payout creation is never retried automatically. A timeout can hide a successful
transfer. Reusing a key returns the original withdrawal; changing keys creates
a new request and must not be used to work around a pending/uncertain outcome.

## Review held payouts

Use admin-authenticated `GET /admin/withdrawals/review?page=1`. It lists flagged
records, uncertain responses, initialization older than one minute and pending
payouts untouched for 24 hours. It returns masked destination information and
merchant/provider references, never full bank numbers or idempotency keys.

1. Freeze new reservations for the campaign if you suspect compromise using
   `PUT /admin/campaigns/:id/payout-freeze` with a meaningful reason. Already-held
   payouts may still finish.
2. Search the active provider's dashboard by merchant reference. Compare provider
   payout ID, recipient, exact net amount and currency. An absent dashboard record
   does not alone prove a timed-out request never reached the provider.
3. Have the provider redeliver the authentic signed final webhook when possible.
   The durable payment-event queue will atomically apply state and ledger entries.
   Do not fabricate a webhook or update a status/ledger row directly.
4. For contradictory final states, mismatched amounts/IDs, initialization interrupted
   before a provider record exists, or unresolved transfers, reconcile with provider
   support. Keep the hold until the outcome is established. No client/admin endpoint
   force-releases uncertain holds or resends them. An audited corrective accounting
   procedure, if required after provider investigation, is separate operational work.
5. Check ledger integrity and campaign available balance after reconciliation. Unfreeze
   only after the review is complete, with another recorded reason.

`PENDING` means awaiting signed confirmation, not delivered. Even a synchronous
provider `succeeded` result remains pending until the final event. `FAILED` means
the held request was returned after definitive rejection/failure. `REVERSED`
means a provider reversal returned it, possibly after success. A contradictory
later success does not automatically debit the restored wallet; it is flagged.

A positive create response or a pending webhook is not proof the bank received
funds. Configured OpenRaise fees are distinct from the provider's own transfer
expenses, which must be reconciled against the provider balance separately.

## Provider references

- [Paystack single transfers and reversal events](https://paystack.com/docs/transfers/single-transfers/)
- [Bachs payout reconciliation](https://docs.bachs.io/guides/payouts/reconcile)
- [Bachs paid event](https://docs.bachs.io/guides/webhooks/events/payout-paid)
- [Bachs failed event](https://docs.bachs.io/guides/webhooks/events/payout-failed)

These contracts were reviewed on 2026-11-05. The initial implementation rejects
cross-currency Bachs payout events; no FX booking is performed.


## Admin workspace actions

The record detail page now supports provider-backed verification and one linked
retry after a confirmed return. Use the failed/returned withdrawal filter to
find retry candidates. Never reset an uncertain attempt's dispatch marker or
edit its amounts. See [[Admin operations]] for eligibility, version checks,
provider evidence requirements and the retry relation.
