# Contributing to OpenRaise

Start with the [docs home](docs/Home.md), [architecture](docs/Architecture.md)
and [decisions](docs/Decisions.md). The `docs/` directory is an Obsidian vault;
you can also read its Markdown files directly. Follow the
[code of conduct](CODE_OF_CONDUCT.md) in project spaces.

## Choose work

Feature notes in `docs/Features/` are the source of task status. Choose a
`status: planned` note, check its dependencies and existing work, and discuss
large changes in an issue before starting. `idea` means the scope still needs
discussion. Do not take a feature already marked `in-progress`.

For a first contribution, look for `good first issue` and `help wanted` labels.
Maintainers should use `good first issue` for a small, bounded task with clear
acceptance criteria, relevant file paths and no unfinished dependencies. Use
`help wanted` for work ready for a contributor, and remove `good first issue`
when the scope grows. Labels supplement the vault; they do not replace it.

When setting up a GitHub remote, a maintainer can create these labels from the
repository directory (requires an authenticated GitHub CLI):

```bash
gh label create 'good first issue' --color 7057ff --description 'Small, scoped task with clear acceptance criteria' --force
gh label create 'help wanted' --color 008672 --description 'Ready for a contributor' --force
```

## Set up locally

Use Node 22+, pnpm and Docker. From the repository root:

```bash
pnpm install --frozen-lockfile
docker compose up -d
cp .env.example apps/api/.env
pnpm --filter @openraise/api db:deploy
pnpm dev
```

Replace the example `JWT_SECRET` in `apps/api/.env` with a local random value
(`openssl rand -base64 48`). Keep credentials out of Git and issue reports.
`pnpm install` generates the Prisma client; `pnpm dev` builds shared code first.
The web app runs on port 3000, the API on 4000 and Mailpit on 8025.
See [Local development](docs/Runbooks/Local%20development.md) for details.

## Make a change

1. Start a branch from current `main`, such as `feat/contributor-guide` or
   `fix/fee-rounding`. Keep one feature or fix per pull request.
2. Set the feature note to `status: in-progress` and record its `branch`.
3. Follow the surrounding TypeScript style. Shared money and validation code
   belongs in `packages/shared`; API behavior belongs in `apps/api`.
4. Add tests for changed behavior. API integration tests live in
   `apps/api/test/`; unit tests sit beside their source as `*.spec.ts`.
5. Update the feature note, API documentation or data model when behavior,
   endpoints or schema change. Record surprising design choices in
   `docs/Decisions.md`.

Money is always integer minor units using `BigInt`, paired with a currency.
Money movements must balance in the ledger. Vendor SDK calls belong inside
provider adapters; see [Writing an adapter](docs/Runbooks/Writing%20an%20adapter.md).
Use original branding, copy and assets.

For schema changes, edit `apps/api/prisma/schema.prisma`, run
`pnpm --filter @openraise/api db:migrate`, then
`pnpm --filter @openraise/api db:generate`. Commit the migration, not the
generated client. Fixed seed data belongs in migrations.

## Verify and open a pull request

Run these from the root, stopping to fix any nonzero exit code:

```bash
pnpm build:shared
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

The e2e suite needs PostgreSQL and permission to create a database. It derives
a separate database from `DATABASE_URL` by appending `_e2e` to its name and
applies migrations there. Use local development credentials for these checks.
Do not point tests at a production database server.

Describe the problem, resulting behavior and checks in the pull request
template. Target `main` directly; do not base your branch on another PR.
Include screenshots for visible UI changes and note any checks you could not
run. Use concise commit messages such as `feat: add campaign filters`; omit
AI attribution and generated-by footers.

Maintainers merge with a merge commit once the required checks pass. After
merging, add a row to `docs/Changelog.md` and mark the feature `shipped`, with
its merge date and PR number (or branch when there is no GitHub remote).

## Reporting problems

Use the bug or feature issue template. Include reproduction steps and redact
tokens, donor information and other private data. For a security issue, use
the repository's private vulnerability reporting feature when available; if
it is unavailable, contact the repository owner privately to arrange a secure
reporting channel before sharing details. Do not post exploit details or
credentials in a public issue.
