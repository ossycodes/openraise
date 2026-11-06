# Campaign creation entry points

Added Start a campaign links in the public header and hero. All point to
/dashboard/campaigns/new. A signed-out click was verified to redirect to
/signin?next=%2Fdashboard%2Fcampaigns%2Fnew so sign-in preserves the creation target.
The existing dashboard form and New campaign dashboard button remain available.

Visible header creation link verified at desktop 1440px, tablet 768px, mobile
390px and narrow 320px. No document horizontal overflow; mobile header uses a
second row and hero actions stack. Narrow-width axe-core scan found zero tested
WCAG A/AA violations. Screenshots are included in this directory.

Also completes the reported local Google One Tap issue: no GIS script or FedCM
prompt on the development homepage. An SDK browser mock verified one initialize,
no automatic prompts, explicit button rendering, a visible exchange-error path
and navigation back to sign-in. No console-error suppression is used. The real
Google button rendered on the local sign-in page. Interactive account login was
not performed.

Web production build, typecheck and lint pass after refreshing generated route
cache for the newly merged dashboard routes. Local dev server runs on port 3000
from branch fix/creator-entry-points in openraise-homepage-layout-fix.
