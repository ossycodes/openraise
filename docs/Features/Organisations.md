---
status: in-progress
branch: feat/organisations
type: feature
area: accounts
milestone: 7
priority: 3
effort: L
tags:
  - feature
---

# Organisations

NGOs, charities and churches raise as an organisation: public profile page,
team members with roles (owner, admin, editor, finance), organisation
verification (CAC / IT registration documents), and campaigns owned by the
organisation rather than one person.

## Part 1: teams

- Create an organisation (verified email; at most 5 owned), public profile at
  `/organisations/<slug>`, dashboard section to edit it and run the team.
- Roles owner, admin, editor, finance. Owners and admins edit the profile and
  invite; admins can't touch owners; the last owner can't leave or be demoted.
- Emailed invitations (7 days, one open per address, accept only with that
  verified email) at `/organisations/invite`.
- Team changes are in the [[Audit log]]. See
  [[Decisions#Organisations: owners stay in charge, invitations are bound to an address]]
  and [[API#Organisations]].

## Still to do (part 2)

- Organisation verification from registration documents (CAC, trustees).
- Campaigns owned by an organisation; editors run them, finance withdraws to
  an account in the organisation's verified name.
- Campaigns listed on the public profile, with a verified badge.
