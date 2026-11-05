---
status: in-progress
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
  contribution guide. There is no GitHub remote yet, so repository labels
  cannot be applied until a maintainer connects one.

Keep this note `in-progress` until the branch merges; record the shipped date
and changelog entry after merging.
