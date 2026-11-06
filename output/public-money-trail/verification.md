# Public money trail verification

2026-11-06. Fictional preview API port 4409 / Next port 3490. No real funds or
bank/donor records are used for browser review. Reduced motion enabled.

- Desktop 1440×1000 and mobile 390×844: totals, wallet balance, native expandable
  breakdown and Paid/In progress/Returned records render; no document overflow.
- Large-value fixture renders ₦90,071,992,547,409.93 exactly without overflow.
- History page 2 shows one remaining record and preserves updatesPage=2.
- Zero-funded campaign distinguishes empty withdrawal history from unavailable
  data. Unavailable trail leaves donation controls present and offers reload.
  Other wallet changes appear explicitly when non-zero.
- axe WCAG 2 A/AA and 2.1 AA: zero violations on desktop and mobile with breakdown
  open. Keyboard-native details/links and text state labels supplement colour.
- Seven real database cases cover public-state gates, zero totals, BigInt amounts,
  donor-covered fees, valid posting chains, other wallet movements, separate
  currencies, reversals, misleading settlement links, privacy, pagination and
  no financial writes during reads.

Final successful checks: lint, typecheck, 173 unit tests, 199 database e2e tests
and both production builds. Initial fixture attempts tried impossible bare
SUCCEEDED states; the database constraints correctly rejected them. Fixtures were
corrected to test a non-null misleading posting link, and the complete suite was
rerun successfully. Exit codes, not partial pass counts, establish the results.

Loading: this section is server-rendered with the campaign page; it introduces
no independent client loading screen. Fetch failure has its own unavailable state.
No schema migration, provider call, fund transfer or banking disclosure is added.
