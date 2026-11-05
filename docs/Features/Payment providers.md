---
status: in-progress
branch: feat/payment-providers
pr: 8
type: feature
area: payments
milestone: 2
priority: 1
effort: L
tags:
  - feature
---

# Payment providers

`PaymentProvider` interface: `createCheckout`, `verifyPayment`,
`verifyWebhook`, `parseWebhook`, `listBanks`, `resolveAccount`,
`createPayout`, `refund`. Selected with `PAYMENT_PROVIDER`.

Adapters:

- **Paystack**: `transaction/initialize`, `transaction/verify`, HMAC-SHA512
  `x-paystack-signature`, transfer recipients + transfers for payouts.
- **Bachs**: checkout sessions with `pricing`, `X-Bachs-Signature-V2`
  verification, payout destinations + payouts. ₦1,000 minimum. See
  [[Architecture#Bachs notes]].

Each adapter has contract tests against recorded sandbox responses.

## Implementation on this branch

- `PaymentsModule` exports `PAYMENT_PROVIDER`: a `PaymentProvider | null`.
  `PAYMENT_PROVIDER=disabled` is the default; consumers must reject payment
  operations when the injected provider is null. No fake payment succeeds.
- Set `PAYMENT_PROVIDER=paystack` with `PAYSTACK_SECRET_KEY`, or `bachs` with
  `BACHS_SECRET_KEY` and the separate `BACHS_WEBHOOK_SECRET`. Only the selected
  adapter needs credentials. `BACHS_BASE_URL` is restricted to the official
  sandbox and production origins, with key/environment mismatch checks.
- Both adapters implement all the operations above, plus `createRecipient`.
  Recipient creation is separate from payout creation because Bachs destinations
  can await approval. Bank lists, account resolution and payouts currently
  support Nigerian NGN bank accounts only. International payout routes and FX
  quotes are outside this branch.
- Checkout accepts NGN, USD, GHS and KES, subject to the provider account's
  enabled corridors and limits. Paystack minimums are 5000/200/10/300 minor units
  respectively. Bachs retains OpenRaise's conservative NGN floor of 100000
  minor units (₦1,000), USD 100, and a positive-minor-unit floor for GHS/KES;
  the provider validates additional account/currency limits.
- Store both checkout `id` and merchant `reference`: Paystack verification
  takes the reference, while Bachs takes the checkout ID and retrieves its
  actual payment. A completed checkout alone never confirms payment. Unknown,
  underpaid, accepted and overpaid states require reconciliation.
- Amounts stay `BigInt` minor units in the domain. Bachs uses exact decimal
  strings at the adapter boundary; Paystack requests/responses reject unsafe
  JSON numbers. Bachs refund money must use the reconciled **settlement**
  currency/amount, which can differ from the donor's payment currency.
- `parseWebhook` verifies the raw bytes itself. Unknown events return null.
  Bachs checks V2 HMAC signatures, every candidate during secret rotation, and
  ±300 seconds; Paystack uses HMAC-SHA512. Paystack deduplication keys combine
  event type and resource ID because it has no top-level event ID. Bachs uses
  its supplied event ID. Neither adapter persists events or posts ledger entries.
- A `collection.failed` event describes an attempt, not a terminal checkout
  failure: downstream processing must allow a later successful payment.
- Requests have a 10-second timeout, reject redirects and never automatically
  retry. Bachs writes carry stable idempotency keys; Paystack checkout, payout
  and refund writes carry stable merchant references. Persist recipient IDs.
  Reconcile ambiguous failures before retrying; an error is not proof that a
  payment or payout did not happen. Errors omit upstream bodies and credentials.

## Validation and remaining integration

Contract tests use sanitized **documentation examples**, with provenance in
`apps/api/src/payments/fixtures/README.md`. No sandbox account credentials were
available, so these are not live recordings. Capturing sanitized sandbox
responses and running provider smoke tests remains necessary before enabling
real payments. Tests cover request/response contracts, unsafe and malformed
amounts, pending/unknown states, references, signatures, replay tolerance,
rotation, recipient readiness, pagination, transport errors and Nest selection.

There are no new HTTP endpoints or database tables in this branch. Checkout,
durable webhook ingestion/deduplication, ledger posting and payout business
rules belong to [[Donation checkout]], [[Payment webhooks]], [[Ledger]] and
[[Withdrawals]]. Keep this note in-progress until the branch is merged.
