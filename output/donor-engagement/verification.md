# Donor engagement verification

162 unit and 137 database-backed tests pass; lint, typecheck and both builds pass.
Five new integration tests cover public/private identity boundaries, settled-only
feeds, default anonymity, immutable checkout preferences, input limits and admin/
owner authorization. Public ranking output never identifies grouped donors.

Browser checks on the labelled fictional preview verify the optional disclosure,
anonymous default, named/anonymous supporter rows, message rendering, no mobile
overflow and privacy preferences retained after uncertain checkout and reload.
Reduced-motion axe-core scan of the expanded guest dialog found zero tested
WCAG A/AA violations. Screenshots are in this directory.
