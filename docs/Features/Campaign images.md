---
status: planned
type: feature
area: campaigns
milestone: 1
priority: 1
effort: M
tags:
  - feature
---

# Campaign images

Split out of [[Campaigns]] so each PR stays reviewable.

A cover image and a gallery (up to 10 images) per campaign, stored in
S3-compatible storage (SeaweedFS locally, R2 or S3 in production) behind a
`StorageProvider`.

- The browser uploads straight to storage with a presigned URL from
  `POST /campaigns/:id/images/upload-url` (content type and size checked:
  JPEG, PNG or WebP, max 5 MB), then confirms with `POST /campaigns/:id/images`.
- The API checks the object exists and matches what was signed before saving.
- Reorder, set cover, delete. Public URLs from `STORAGE_PUBLIC_URL`.
- Campaign cards and Open Graph previews use the cover.
