---
status: shipped
type: feature
area: campaigns
milestone: 1
priority: 1
effort: M
branch: feat/campaign-images
pr: 7
shipped: 2026-11-05
tags:
  - feature
---

# Campaign images

Split out of [[Campaigns]] so each PR stays reviewable.

A cover image and a gallery (up to 10 images) per campaign, stored in
S3-compatible storage (SeaweedFS locally, R2 or S3 in production).

- The browser uploads straight to storage with a presigned URL from
  `POST /campaigns/:id/images/upload-url` (JPEG, PNG or WebP, max 5 MB), then
  confirms with `POST /campaigns/:id/images`.
- The API checks what was actually stored (size and real file type) before
  saving it.
- Reorder, delete; the first image is the cover. Public URLs from
  `STORAGE_PUBLIC_URL`.

## As built

- Endpoints: [[API#Campaign images]]. Table: [[Data model#CampaignImage]].
- `StorageService` (global) wraps the S3 client: presign, head, read the first
  bytes, delete. Works with any S3-compatible store; config is `STORAGE_*`.
- File type is sniffed from the bytes, not trusted from the client:
  [[Decisions#Images upload straight to storage, then get checked]].
- SDK checksums only when required:
  [[Decisions#S3 checksums only when required]].
- Deleting a draft deletes its files; deleting an image renumbers the rest.
- e2e tests run against real SeaweedFS, locally and in CI.
- Not yet: cleanup of uploads that were never attached (needs the job queue),
  image resizing and thumbnails, Open Graph images (with the [[Campaign page]]).
