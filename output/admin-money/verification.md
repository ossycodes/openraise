# Admin money workspace verification

2026-11-06. Fictional loopback preview API port 4408 / Next port 3480. Browser
fixtures never touch real donations, payouts or provider accounts. Reduced motion.

- Overview at 1440×1000 (full-page screenshot), queue and record detail at desktop;
  mobile overview, ledger/posting detail, campaign wallet and failure states at
  390×844. No document overflow observed. Screenshots inspected locally.
- GET currency filters return the USD posting. Reconciliation → reservation link
  opens the posting. Campaign-filtered ledger displays NGN and USD wallet balances.
- Failed summary retains direct ledger/queue links. Loading skeleton observed with
  delayed API response. Empty filters, fetch error/retry, missing records, integrity
  warning, non-admin denial and signed-out redirect checked.
- Unknown provider currency renders raw minor units instead of assuming NGN.
- axe WCAG 2 A/AA and 2.1 AA: zero violations on desktop overview and mobile
  ledger-posting detail. This supplements manual inspection.
- Eight API e2e cases cover current-role access; no write endpoint; exact BigInt
  balances beyond Number precision; currency/campaign/type/reference filtering;
  posting integrity; queue classification; event linkage without raw payloads;
  bank masking; read-only state/count checks; pagination and validation.

Broad checks exited 0: lint, typecheck, 173 unit tests, 192 database e2e tests,
API and web production builds. The focused eight-case suite and builds passed
again after adding campaign wallet balances. Final web lint/typecheck/build passed
following mobile wrapping/copy adjustments. No schema migration is needed.

Limits: no resolution workflow, provider lookup, retry, adjustment or export in
this feature. Queues can overlap: a provider event and payment may refer to the
same incident. Displayed ledger checks do not establish external provider cash.
