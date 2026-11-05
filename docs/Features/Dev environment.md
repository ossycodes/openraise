---
status: shipped
type: feature
area: infra
milestone: 1
priority: 1
effort: S
branch: feat/dev-environment
pr: 1
shipped: 2026-11-05
tags:
  - feature
---

# Dev environment

pnpm + Turborepo monorepo (`apps/api`, `apps/web`, `packages/shared`) and a
`docker-compose.yml` with Postgres, Redis, MinIO and Mailpit, so a contributor
runs `pnpm i && docker compose up -d && pnpm dev` and has everything.

- `.env.example` documenting every variable
- Lint, typecheck and test scripts at the root; CI on GitHub Actions
- AGPL-3.0 `LICENSE`, README with setup
