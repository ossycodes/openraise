---
title: Writing an adapter
tags:
  - runbook
  - providers
---

# Writing an adapter

Payments and identity verification are planned features. Their interfaces and
modules do not exist yet; the provider names in [[Architecture]] describe the
target design. This guide defines the contribution expectations, not an API
you can import today. Coordinate the first adapter with [[Payment providers]]
or [[Identity verification]] so the interface and its first implementation
arrive together.

## Define the boundary

Keep business rules in services and vendor protocol details in adapters.
Define provider-neutral request and result types next to the owning module,
plus an injection token for the interface. Interfaces disappear at runtime,
so Nest cannot inject one by its TypeScript name alone.

Select the implementation once in the module's provider factory using
validated environment configuration. Add the selector and required settings
to `apps/api/src/config/env.ts` and `.env.example`; fail clearly at startup
when the selected adapter is missing credentials. Do not require credentials
for inactive adapters. Never put secrets into shared code or the web app.

Keep SDK imports, URLs, authentication, HTTP requests and vendor response
types inside the adapter. Translate vendor results into domain types, using
explicit pending, failed and unsupported outcomes where needed. Do not expose
a vendor SDK's types to controllers or require vendor-specific branches in
business services. The existing SMTP `MailService` is an early implementation,
not yet the general provider interface described by the architecture.

## Payment adapters

Agree on the checkout, server-side verification, webhook and payout operations
needed by the feature before implementing them. Declare supported currencies,
minimum amounts and capabilities; reject unsupported requests explicitly.

- Accept money as `bigint` minor units and an explicit ISO currency. Validate
  amounts before calling the provider. If its SDK requires JavaScript numbers,
  check the safe integer range before conversion; never round money.
- Use stable idempotency keys for checkout and payout creation. Set request
  timeouts and retry only operations that are safe to retry. A timeout is an
  unknown result, not proof that a payment failed.
- Verify webhook signatures against the original raw bytes. Preserve
  `rawBody: true` in `apps/api/src/main.ts`. Follow the vendor's documented
  signature and timestamp rules, including constant-time comparison where
  applicable. Reject invalid signatures before processing the event.
- Normalize the provider event ID and type for durable deduplication. Keep
  database event persistence and processing in the webhook service/job layer.
  Return a failure response on internal ingestion failure so delivery can retry.
- Reconcile the reference, currency and amount against the stored donation
  before marking it paid. Redirects from hosted checkout cannot confirm payment.
  Keep ledger posting in the domain layer and make it idempotent.
- Redact authorization headers, bank details and sensitive webhook fields in
  logs. Use sandbox credentials and sanitized fixtures for development.

## KYC adapters

Define a normalized verification result with explicit pending, verified and
rejected states. Separate provider outages or malformed responses from a
genuine rejection; neither a timeout nor an unknown status means verified.
Document supported countries, identity types and any manual-review fallback.

Keep personal identity data out of logs and committed fixtures. Store only the
data needed by the domain model, restrict access to verification results, and
document any new retention requirements. Authenticate callbacks and deduplicate
events when the provider completes verification asynchronously.

## Verification and documentation

Use fake transports or SDK clients in unit tests; normal test runs must not
contact live providers. Cover successful mapping, provider rejection, timeout,
malformed response, unsupported capability and credential selection. Payment
tests should also exercise exact amount conversion, signature tampering,
duplicate delivery and idempotent retries. KYC tests should cover pending and
unknown statuses and authenticated callbacks where supported.

Use API integration tests for domain effects such as one ledger posting after
duplicate callbacks or denied access to another user's verification. Describe
an optional sandbox smoke test separately, without requiring paid services or
real identity records for CI.

Update `.env.example`, [[Architecture]], [[API]] and the matching feature note
with actual supported capabilities and setup steps. Update [[Data model]] for
schema changes. Record new cross-provider design choices in [[Decisions]].
Run the checks in [CONTRIBUTING.md](../../CONTRIBUTING.md) before opening a PR.
