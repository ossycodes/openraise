---
status: in-progress
branch: feat/campaign-youtube-video
type: feature
area: campaigns
milestone: 5
priority: 2
effort: S
tags: [feature]
---

# Campaign video

Optional YouTube video alongside campaign photos. Creators supply a supported
YouTube HTTPS link through create/update; canonicalization strips tracking,
playlist and playback parameters. Null removes the video. Public pages offer
video/photo controls, load the embedded player on request, and retain a direct
YouTube link for unavailable or non-embeddable videos. No raw HTML or arbitrary
iframe hosts are accepted. Creator form integration belongs to the dashboard.


## Verification and references

Supported URL forms and malicious lookalikes are covered by shared tests. API
integration tests cover canonical persistence, create/edit/removal, unchanged
ownership/review rules and public read responses. Browser checks cover photo-only,
video-only and mixed media, no pre-click YouTube requests, focus transfer to the
player, playback of the official demo, stopping playback by switching to photos,
responsive reflow and accessibility scans of the host UI.

Screenshots/evidence: `output/campaign-video/`. Creator form integration is still
pending the dashboard. The player does not verify video ownership or availability.

References reviewed on 2026-11-05:
- [YouTube player parameters](https://developers.google.com/youtube/player_parameters)
- [YouTube embedding and privacy-enhanced mode](https://support.google.com/youtube/answer/171780)

The supplied Quickraiz screenshot was the product reference; its live page timed
out during inspection. The implementation uses OpenRaise's own design and copy.
