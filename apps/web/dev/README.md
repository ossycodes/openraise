# Campaign design preview

This local fixture contains fictional people, campaign copy, donations and a
generated photo. It never collects money and binds only to loopback.

From the repository root:

```sh
pnpm build:shared
node apps/web/dev/preview-server.mjs
```

In a second terminal:

```sh
API_URL=http://127.0.0.1:4401 WEB_URL=http://localhost:3400 CAMPAIGN_PREVIEW=true pnpm --filter @openraise/web exec next dev -p 3400
```

Open http://localhost:3400/campaigns/help-ada-finish-nursing-school.
The preview banner and noindex metadata are enabled only outside production.
Normal deployments use their real API and uploaded campaign photos.

Fixture slugs: `empty-campaign`, `partial-campaign`, `paused-campaign`,
`missing-campaign`, `unavailable-campaign`, `payments-unavailable`, `long-campaign`.
Email `uncertain@example.com` simulates an uncertain checkout;
`changed@example.com` simulates a changed fee total requiring a second review.
The fixture checkout host is intentionally a non-payment `.test` address.
