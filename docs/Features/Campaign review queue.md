---
status: shipped
pr: 32
shipped: 2026-11-06
branch: feat/campaign-review-dashboard
type: feature
area: trust
milestone: 4
priority: 2
effort: M
tags:
  - feature
---

# Campaign review queue

Campaigns submitted for publishing land in an admin queue. Approve, reject
with a reason, or request changes. Optional auto-approve for verified creators
(deployment setting).

## Dashboard implementation

Admin-only `/admin/campaigns` lists pending submissions oldest first, with
search, pagination and Live/Returned filters. Open a campaign to inspect its
story, photos or optional YouTube video, goal, beneficiary and organiser email
verification. The creator dashboard shows the workspace link to admins only;
API authorization always checks the current database role.

Approve publishes immediately. Return for changes requires a clear reason that
the creator sees in their dashboard. Both write a `CampaignReview` history row
in the same transaction as the transition. Snapshot checks reject stale browser
submissions and competing decisions; self-review and approval after the end
date are refused. The existing API approve/reject routes share this audit path.

Identity verification and automatic approval remain separate follow-ups. Email
verification is labelled explicitly and is not presented as KYC. No decision
emails are sent by this feature; creators see the current status and reason in
their existing dashboard. The broader [[Admin console]] remains planned.

Screenshots and checks: `output/campaign-review/verification.md`.
