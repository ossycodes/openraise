# OpenRaise

Open-source, self-hostable crowdfunding for African communities. pnpm monorepo:
NestJS API (`apps/api`), Next.js web app (`apps/web`), shared code
(`packages/shared`). Project docs are an Obsidian vault in `docs/`: start at
`docs/Home.md`.

## Resuming work

When starting a session, resuming work, or after the context is compacted,
read these before continuing so you work from the recorded state rather than
a summary:

- `docs/Home.md`: the map of the vault
- `docs/Changelog.md`: what has shipped, newest first
- `docs/Tracker.base` (Roadmap view, grouped by milestone) and the notes in
  `docs/Features/`: what's planned, in progress, and known tech debt
- `docs/Decisions.md`: why things are built the way they are

## Keep the docs current

When starting a feature, set its note in `docs/Features/` to
`status: in-progress`.

After a PR merges:

- Add a row to `docs/Changelog.md`.
- Set the matching note in `docs/Features/` to `status: shipped` with `pr` and
  `shipped` (create the note if it's new). The tracker (`docs/Tracker.base`)
  reads these properties.
- Record surprising choices in `docs/Decisions.md`.
- Update `docs/API.md` / `docs/Data model.md` when endpoints or the schema change.

## Rules

- Money is integers in minor units (kobo, cents) as `BigInt`. Never floats.
- Every money movement is a balanced set of ledger entries; balances are derived
  from the ledger, never stored as a mutable number.
- Payments, KYC, AI, storage and email go through provider interfaces chosen by
  env config. Don't call a vendor SDK outside its adapter.
- Own brand and design. Don't copy text, images or UI from other platforms.

## Workflow

- One PR per feature, opened against `main`, merged with merge commits.
  Never base a PR on another PR's branch (GitHub stacks block merging).
- No AI attribution (Co-Authored-By, "Generated with") in commits or PRs.
- Judge test runs by exit code, not the "N passed" line.
