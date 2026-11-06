# Campaign updates verification

Fictional fixture campaign; no real payments or emails. API fixture port 4404,
Next preview port 3440. Browser checks use reduced motion. 2026-11-06.

- Public timeline with photos at 1440×1000 and 390×844; no horizontal overflow.
- Owner publishing form at 1440×1100 and 390×844. Successful POST refreshes the
  history and clears the form. A simulated 503 freezes content; Retry publishing
  sends exactly the same body and request key, then succeeds.
- Empty timeline and unavailable-updates fallback render independently of the
  campaign and donation panel.
- Update email consent is unchecked by default in checkout.
- Unsubscribe opens with zero mutation requests, removes its fragment, and sends
  one POST only after the confirmation button is clicked. Confirmation succeeds.
  Browser testing caught and fixed a Strict Mode effect replay bug.
- axe WCAG 2 A/AA + 2.1 AA: zero violations in the public campaign timeline,
  publisher and mobile checkout dialog. This does not replace manual review.
- API tests cover owner/admin permissions, verified-email and public-state
  gates, validation, immutable photo snapshots (real SeaweedFS), pending vs
  settled consent, deduplicated mail, current consent at send, unsubscribe,
  hiding, ambiguous SMTP, pagination and bounded fan-out resumption.

Screenshots: public-desktop.png, public-mobile.png, publisher-desktop.png,
publisher-mobile.png, checkout-consent-mobile.png, empty-mobile.png,
unavailable-mobile.png, unsubscribe-mobile.png.

Mail is exercised through the fake adapter, including actual worker claims and
uncertain SMTP errors. Production inbox delivery and provider reputation are not
covered by local tests.

Checks completed with exit code 0: lint, typecheck, 162 unit tests (47 shared +
115 API), 142 database e2e tests, both production builds, git diff --check and
frontend evidence validation. The focused engagement suite has 10 cases.

The browser photo preview uses a mocked upload response; image upload, copying,
validation and overwriting the original upload are covered against real local
SeaweedFS in the API suite. Publisher screenshots include a photo draft; the
mobile version also demonstrates validation feedback. Publishing-busy controls
were checked with a delayed response, then a 400 returned the form to editing.
