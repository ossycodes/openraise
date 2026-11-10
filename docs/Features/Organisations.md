---
status: in-progress
branch: feat/organisation-verification
pr: 61
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

## Part 2a: verification

- Owners and admins send the CAC registration type, number, name and a
  certificate photo from the organisation page; an administrator outside the
  organisation verifies or declines it from "Organisation checks".
- Verified organisations show a badge and their registered name on the public
  profile. See
  [[Decisions#Organisation verification reuses the identity check, with outsiders deciding]]
  and [[API#Organisation verification]].

## Still to do

- Part 2b: campaigns owned by an organisation, run by its editors, listed on
  its profile.
- Part 2c: finance members withdraw to an account in the organisation's
  verified name.
