---
status: shipped
pr: 57
shipped: 2026-11-09
branch: feat/seo-guides
type: feature
area: growth
milestone: 6
priority: 3
effort: M
tags:
  - feature
---

# SEO pages and guides

"Raise money for medical bills / school fees / emergencies…" landing pages per
category, plus guides (how crowdfunding works, writing a fundraising story,
promoting a fundraiser). Sitemap, structured data. Written fresh; no copied
content.

## Implementation

- `/raise-money-for/<category>` for every category: written intro, what people
  raise for, the category's live campaigns, tips, and an FAQ whose fee answer
  comes from the deployment's fee settings. Breadcrumb and FAQ structured data.
  Copy in `apps/web/app/_lib/category-pages.ts`; new categories fall back to
  their name and description.
- `/guides` with three guides: how fundraising works here (with a live fee
  box), writing a fundraising story, and promoting a fundraiser online and
  offline. Article structured data. Copy in `apps/web/app/_lib/guides.ts`.
- `sitemap.xml` (home, guides, categories, up to 1,000 live campaigns) and
  `robots.txt`.
- Footer links to six causes and the guides on every public page; the
  homepage campaign tile is now a shared `CampaignTile` component.
- See [[Decisions#Landing pages and guides live in code, and never quote fees]].
