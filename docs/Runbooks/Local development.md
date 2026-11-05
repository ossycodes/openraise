---
title: Local development
tags:
  - runbook
---

# Local development

## Setup

Requirements: Node 22+, pnpm, Docker.

```bash
pnpm install
docker compose up -d            # Postgres, Redis, S3 storage, Mailpit
cp .env.example apps/api/.env
pnpm dev                        # builds packages/shared, then API :4000 + web :3000
```

| Service | URL |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:4000 (`/health`) |
| Mailpit inbox | http://localhost:8025 |
| S3 storage (SeaweedFS) | http://localhost:8333 |

## Checks before merging a feature branch

Run each and check the **exit code**, not the "N passed" line (Vitest can
report all passed and still exit 1 on unhandled errors):

```bash
set -o pipefail
for s in lint typecheck test build; do pnpm $s; echo "$s exit: $?"; done
```

## Gotchas

- **Build `packages/shared` first.** Both apps import its compiled `dist/`.
  `pnpm dev` and CI do this; if a fresh clone's tests fail with "Cannot find
  module '@openraise/shared'", run `pnpm build:shared`.
- **TypeScript is pinned to 6.** `pnpm add typescript` picks TS 7 (native
  port), which the Nest CLI build doesn't support yet. See
  [[Decisions#TypeScript pinned to 6]].
- **`next build` rewrites `apps/web/tsconfig.json`** (e.g. `jsx: react-jsx`,
  extra `include` entries). That's expected; commit the result.
- **The API reads the raw request body** (`rawBody: true` in `main.ts`) so
  payment webhooks can be signature-checked. Don't remove it.
