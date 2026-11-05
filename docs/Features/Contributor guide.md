---
status: shipped
pr: 5
shipped: 2026-11-05
branch: feat/contributor-guide
type: feature
area: ops
milestone: 8
priority: 3
effort: S
tags:
  - feature
---

# Contributor guide

`CONTRIBUTING.md`, issue and PR templates, code of conduct, "good first issue"
labels, and a guide to writing a new payment or KYC adapter.

## Branch implementation

- Added root `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`.
- Added bug report, feature request and pull request templates in `.github/`.
- Added [[Writing an adapter]] with payment and KYC boundaries, validation
  expectations and an explicit distinction between planned and existing code.
- Linked the guides from the README and [[Home]].
- Documented label criteria and repeatable GitHub CLI commands in the
  contribution guide. Confirmed that `good first issue` and `help wanted`
  already exist on `ossycodes/openraise`.

Merged in [PR #5](https://github.com/ossycodes/openraise/pull/5).
