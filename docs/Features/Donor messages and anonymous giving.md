---
status: shipped
pr: 29
shipped: 2026-11-06
branch: feat/donor-messages
type: feature
area: donations
milestone: 2
priority: 2
effort: S
tags:
  - feature
---

# Donor messages and anonymous giving

Donors can leave a message of support and choose to appear as "Anonymous" on
the campaign page (the creator and admins still see the name for refunds and
fraud checks). Recent donations feed on the campaign page.

## Implementation

Optional name/message disclosure in guest checkout; anonymous by default. The
API validates lengths and requires a name when public attribution is chosen.
Preferences are frozen with the payment request and survive session recovery.
Confirmed recent gifts show the chosen name or “Anonymous” and plain-text message;
rankings remain anonymous. The organiser's private donations table shows supplied
names, and admins have a guarded review read. No email or user IDs are public.

No claim is made that a name is identity-verified. Anonymous hides the name, not
personal details a donor writes in the explicitly public message. Existing gifts
remain anonymous and CSV exports remain financial-only. See [[API]].
