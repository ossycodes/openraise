---
title: KYC vendors
tags:
  - runbook
  - providers
---

# KYC vendors

Local implementation supports Nigerian NIN and BVN only. Normal tests use
synthetic documentation-shaped responses and fake transports; no live vendor
contracts have been confirmed. Keep `KYC_PROVIDER=manual` until the selected
provider passes its sandbox checks. This does not require enabling payments.

| Provider | Required configuration | Checks |
|---|---|---|
| manual | none | Administrator compares an uploaded ID with submitted details |
| qoreid | `QOREID_CLIENT_ID`, `QOREID_SECRET` | Authority lookup plus required selfie face match |
| dojah | `DOJAH_APP_ID`, `DOJAH_SECRET_KEY` | NIN/BVN lookup with required selfie match |
| smile | `SMILE_PARTNER_ID`, `SMILE_API_KEY`, `SMILE_CALLBACK_URL`, `SMILE_PRIVACY_POLICY_URL` | Enhanced KYC authority lookup; no biometric match |

Set `KYC_PROVIDER` to the selected name. Base URLs are allowlisted in env
validation. Dojah defaults to `https://sandbox.dojah.io`; Smile defaults to
`https://testapi.smileidentity.com`; QoreID uses `https://api.qoreid.com` with
account-specific sandbox access. Supply credentials only in deployment secrets.
`.env.example` lists every setting. Restart the API after changing settings.

Run `pnpm --filter @openraise/api db:deploy` to apply the BVN enum migration
before serving vendor submissions. Use a stable `KYC_ENCRYPTION_KEY` for
photo/selfie encryption and preserve it across JWT-secret rotation.

For Smile, configure an allowed callback domain and set an HTTPS URL ending
in `/webhooks/kyc/smile`. The API adds its per-check token query parameter.
Redact callback query strings at the proxy, load balancer and monitoring layer.
Do not publish these URLs or log raw vendor request/response bodies. Configure
a real HTTPS privacy notice: its link appears beside the explicit consent
checkbox and its URL is sent to Smile. Keep the API key unchanged until pending
jobs finish; key rotation otherwise invalidates their callback authentication.

Full ID numbers are sent to vendors but never persisted locally. Selfies and
manual ID images are encrypted in storage and follow the existing retention
policy. All automated verification requires authority name and birth date;
Dojah/QoreID additionally require an affirmative face match. A missing or
malformed result cannot verify a person. A browser selfie upload is not a
liveness check; Smile Enhanced KYC has no selfie check at all.

A pending row exists before the paid request. Network/auth/billing errors and
malformed acknowledgements leave it pending and return 503. Reload the status;
do not resend or automatically retry. An administrator must investigate and
decide an unresolved check from Identity checks, with a reason for rejection.
Smile clear/block callbacks close the check once; attention/error leave it open.
Decision updates use the existing audit trigger. Synchronous decisions are shown
immediately; asynchronous decisions email the creator.

## Sandbox checklist

Use vendor-provided test identities and consented test selfies only. Capture
sanitized fixtures with source/date and no identifiers, credentials or photos.

1. Confirm selected credentials, account permissions and the NIN/BVN endpoints.
2. Test matching and mismatching name, birth date and selfie; confirm unknown
   and incomplete responses cannot verify a creator.
3. Exercise missing consent, unsupported document, expired credentials,
   insufficient balance, throttling, timeout and malformed responses.
4. Confirm concurrent submissions dispatch one paid check, and uncertain
   results remain pending until reviewed or a valid callback arrives.
5. For Smile, verify real multipart token/consent and acknowledgement formats,
   preserved `customer_ref_id`, callback URL query delivery, signature headers,
   clear/block/attention/error outcomes, duplicate delivery and early callbacks.
6. Confirm a verified creator can submit a campaign and use a bank account
   matching the verified authority name. A rejected/pending creator stays gated.
7. Confirm encrypted image retention/deletion and redacted ingress logs before
   selecting production URLs and credentials.

## Contract sources

- [Dojah NIN/BVN selfie contract](https://docs.dojah.io/api-reference/individual-verification/nigeria/bvn-nin-selfie)
- [QoreID NIN face verification](https://docs.qoreid.com/reference/photo-matching)
- [Smile token API](https://docs.usesmileid.com/api-reference/set-up/access)
- [Smile Enhanced KYC API](https://docs.usesmileid.com/api-reference/products/enhanced-kyc/perform-an-enhanced-kyc-verification)
- [Smile v2-to-v3 migration](https://docs.usesmileid.com/guides/migration-guides/readme)
- [Smile callback signatures](https://docs.usesmileid.com/developer-resources/essentials/verification-webhooks/receive-webhooks/configure-your-webhook-server)

Reviewed 2026-11-13. Provider examples are contract guidance, not evidence of
successful sandbox execution.
