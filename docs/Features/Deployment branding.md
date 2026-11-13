---
status: shipped
branch: feat/deployment-branding
pr: 17
shipped: 2026-11-05
type: feature
area: web
milestone: 5
priority: 2
effort: S
tags:
  - feature
---

# Deployment branding

Follow-up to [[Landing page]]. Every self-hosted deployment runs under its own
name and look without changing code.

- Site name, logo, favicon, primary colour and support email from deployment
  config, used by the web app, Open Graph images and emails.
- Sensible OpenRaise defaults when nothing is set.
- Documented in `.env.example` and the deploy guide ([[One-command deploy]]).

The [[Admin console]] follow-up adds saved branding overrides in the admin
workspace. These apply across API instances immediately; environment config
remains the initial default. Email templates receive the saved name when
generated; existing queued emails retain their original copy.
