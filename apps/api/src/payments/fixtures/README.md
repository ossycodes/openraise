# Provider contract fixtures

These are reduced, sanitized examples based on the official API documentation,
not recordings of live sandbox requests. IDs and personal details are fictitious.
Tests assert both outgoing requests and normalized results. Live sandbox contract
recordings remain a follow-up once test accounts are available; these fixtures
must not be presented as evidence that either account has been exercised.

Sources checked 2026-11-05:

- [Paystack transactions](https://paystack.com/docs/api/transaction/)
- [Paystack transfers](https://paystack.com/docs/api/transfer/)
- [Paystack recipients](https://paystack.com/docs/api/transfer-recipient/)
- [Paystack verification](https://paystack.com/docs/api/verification/)
- [Paystack refunds](https://paystack.com/docs/api/refund/)
- [Paystack banks](https://paystack.com/docs/api/miscellaneous/)
- [Paystack webhooks](https://paystack.com/docs/payments/webhooks/)
- [Bachs checkout creation](https://docs.bachs.io/api-reference/payments/create-checkout-session)
- [Bachs checkout retrieval](https://docs.bachs.io/api-reference/checkout-sessions/get-checkout-session)
- [Bachs payment retrieval](https://docs.bachs.io/api-reference/payments/get-payment)
- [Bachs payouts](https://docs.bachs.io/api-reference/payouts/create-payout)
- [Bachs destinations](https://docs.bachs.io/api-reference/payouts/create-payout-destination)
- [Bachs refunds](https://docs.bachs.io/api-reference/refunds/create-refund)
- [Bachs banks](https://docs.bachs.io/api-reference/reference/list-banks)
- [Bachs account resolution](https://docs.bachs.io/api-reference/misc/resolve-a-bank-account)
- [Bachs webhooks](https://docs.bachs.io/guides/webhooks/overview)
- [Bachs collection event](https://docs.bachs.io/guides/webhooks/events/collection-succeeded)


Payout lookup contracts added 2026-11-13 use synthetic examples from the
Paystack transfer verification and Bachs payout retrieval references above
([Bachs get payout](https://docs.bachs.io/api-reference/payouts/get-payout)).
Tests cover exact amount/destination matching, preserved reversal state, missing
payout identifiers, malformed evidence and lookup errors. No live recordings
were captured.
