# Campaign review workspace

Job: help an administrator inspect a submitted campaign and make a deliberate,
accountable publishing decision. Primary action: open the oldest pending
submission, review its story and media, then approve or return it with a reason.

Use existing OpenRaise serif headings, DM Sans controls, ivory background and
forest-green accents. A compact admin masthead, count strip and divided queue
rows give repeated scanning priority over decorative cards. The detail view
pairs a readable story/media column with a sticky decision panel. Amber marks
pending work; text labels accompany all status colours.

Targets: 1440x1000 and 390x844. Queue rows become stacked mobile items; actions
remain full-width and in normal document flow on mobile. No new dependencies.

States: loading skeleton; empty filtered queue; API error with retry; unavailable
photo fallback with all text retained; clear decision success and next-review
link; non-admin denial with dashboard return. A stale decision keeps its reason
and asks the reviewer to reload. Rejections require 3–1000 trimmed characters.
