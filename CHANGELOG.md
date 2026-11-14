# Changelog

This project uses Semantic Versioning. Releases use matching `vX.Y.Z` Git tags.

## Unreleased

- Add a top-bar storage meter and a strict shared 10 GB quota for all R2 writes.
- Reserve exact file bytes atomically and retain charges for uncertain writes or pending deletes.

- Add coordinated sheet transitions and press feedback with reduced-motion and keyboard support.

- Open saved items and forms in sheets with blurred backdrops and mobile outside-tap dismissal.
- Add clickable image previews with zoom and gallery navigation, plus an icon-only mobile Save button.
- Automatically tag Twitter/X sources.

- Add confirmed item deletion with durable R2 cleanup and archive-race handling.
- Add editable item tags and combined tag filters.
- Keep saved-item cards equal-sized and truncate tweet preview text.

- Archive public Twitter/X posts with author, date, text, and local R2 image copies.
- Add saved-post views, archive status, retries, and archive content search.

- Add collections with a default Inbox, link capture, image and file uploads, and item moves.
- Store metadata in one D1 database and uploads in one shared private R2 bucket.
- Add responsive dark desktop and phone layouts, accessible dialogs, search, and type filters.
- Add an open, rate-limited URL capture endpoint and isolated API integration checks.

## 0.0.1 — 2026-11-09

- Initialize the Vault foundation with React Router, TypeScript, and Cloudflare Workers.
- Configure local D1 and R2 bindings without an application schema.
- Add development checks and project workflow documentation.
