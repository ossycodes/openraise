---
status: planned
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
