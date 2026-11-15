# Cerberus

A quiet, personal home for links, images, and files. Create collections, save
things worth keeping, and sort them whenever you’re ready. The responsive dark
interface uses charcoal surfaces, Inter typography, and square panels. It uses
a workspace rail and sidebar on desktop and bottom navigation on phones.

## Stack and storage

- React Router, React, TypeScript, and Cloudflare Workers.
- Base UI for accessible sheets and image viewing; Sonner for toasts; Lucide for icons.
- One D1 database (`DB`) holds collections and all item metadata.
- One private R2 bucket (`FILES`, `vault-files`) holds uploaded files and images.
- A seeded **Inbox** collection receives unclassified items. Collections share
  storage; creating one does not provision another database or bucket.
- Files are limited to **10 MB each**. JPEG, PNG, WebP, GIF, and AVIF get image
  previews. Other formats, including SVG and HTML, are served as downloads.
- Twitter/X post links are archived automatically. Other links are stored as URLs.

## Run locally

Use Node.js 24 (see `.nvmrc`) and npm:

```sh
npm ci
npm run db:migrate:local
npm run dev
```

Open the URL printed by Vite, normally http://127.0.0.1:5173. Storage persists in
`.wrangler/`. No Cloudflare account or cloud resources are needed for development.
Apply migrations before starting the app for the first time or after schema changes.

To test from a phone on the same trusted Wi-Fi:

```sh
npm run dev -- --host 0.0.0.0
```

Open the Network URL printed by Vite. Verify creating a collection, saving a
link, uploading an image and a file, opening/downloading them, moving an Inbox
item to a collection, and searching/filtering. Check dialogs with the keyboard
open, portrait/landscape layouts, and bottom navigation on real hardware.

Library pages use `/`, `/collections`, and `/collections/:id`. Search, type,
tags, and pagination stay in query parameters. Old `?collection=` and
`?view=collections` links redirect to the corresponding page without losing filters.
Save items from the bottom of the desktop sidebar or the mobile bottom navigation.
The header stays visible while scrolling. Item toasts include a **View item** action
that opens `/collections/:id/items/:itemId`, including items beyond the first page.
The image viewer fills the viewport on both desktop and mobile. Page changes use a
150 ms entrance, with immediate updates for keyboard navigation and reduced motion.

## Capture a link from your phone

`POST /api/capture` deliberately needs **no authentication token**. Send JSON or
URL-encoded form data from an iOS Shortcut, Android automation, or an HTTP client:

```sh
curl http://127.0.0.1:5173/api/capture \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","title":"Something worth keeping"}'
```

Use your LAN or deployed hostname when calling from a phone. Only `url` is
required. Valid HTTP/HTTPS links always land in Inbox; supplied collection IDs
are ignored. URLs with embedded credentials are rejected. Twitter/X post URLs trigger the same archive flow as UI saves. The endpoint
does not accept file uploads or expose your library.

Success: `201 {"item":{"id":"…","collection_id":"inbox",…}}`.
Errors use `{ "error": "…" }` with an appropriate status (`400`, `413`, `415`,
`429`). Request bodies are limited to 8 KB. The Cloudflare limiter allows 30
requests per minute per IP per location, with `Retry-After: 60` on rejection.
This is an approximate local rate limit, not a global quota. Browser cross-origin
API access is not enabled; native HTTP clients such as Shortcuts work without CORS.

Other endpoints power the UI:

| Endpoint                      | Purpose                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `POST /api/collections`       | Create with `name` and optional `description`                                                                           |
| `POST /api/items`             | Save JSON link (`url`, optional `title`, `collection_id`) or multipart file (`file`, optional `title`, `collection_id`) |
| `PATCH /api/items/:id`        | Move using `collection_id` or replace tags using `tags`                                                                 |
| `DELETE /api/items/:id`       | Permanently delete the item and its stored content                                                                      |
| `GET /api/files/:id`          | Preview a supported image or download a file                                                                            |
| `GET /api/files/:id?download` | Force download                                                                                                          |

Lists are server rendered, newest first, with 48 items per page. Search covers
titles, URLs, and filenames; SQLite’s built-in case folding is ASCII oriented.
Metadata is parameterized in D1 queries. Failed metadata writes clean up the
uploaded R2 object. Changing an item’s collection does not duplicate its file.

## Strict file storage cap

Cerberus enforces a total **10 GB = 10,000,000,000 bytes** limit across uploaded
files, images, and archived tweet photos in the shared R2 bucket. The top bar
shows charged storage against this cap, including in-flight reservations.
Usage refreshes after saves/deletes and periodically while the page is visible.
The existing 10 MB per-file limit also remains in place.

Apply `0005_storage_quota.sql` before running this version. On first use, Cerberus
inventories R2, including objects absent from item metadata. Uploads are blocked
until the inventory is verified. Reservations use an atomic D1 insert guarded by
a database trigger; all R2 writes go through this gate and reserve the exact
upload buffer size. Concurrent requests cannot spend the same remaining bytes.
Over-limit file requests return HTTP **507**, while tweet archives keep their
text and report that photos could not fit.

Capacity is released only after a settled write has been successfully deleted
from R2. Pending deletes remain charged. If a PUT has an uncertain outcome, its
reservation stays charged and never expires automatically: a transport failure
is not evidence that the object was never stored. Such reservations need safe
operator reconciliation, rather than being silently refunded.

Use this Worker as the bucket’s only writer. Direct R2 console/S3 writes or
manual database edits are outside the application’s quota enforcement. D1
metadata is separate from this R2 file cap. No account billing limit is changed.

## Tags and deletion

Add comma-separated tags when saving a link, image, or file. Use the tag button
on any item to add, replace, or clear its tags later. Tags are case-insensitive,
normalized, and deduplicated, with up to 10 tags per item and 32 characters per
tag. Twitter/X links also receive a persistent `twitter` source tag, which does
not use a custom-tag slot. Existing Twitter/X links are tagged by migration
`0004_twitter_tag.sql`. Phone capture accepts optional `tags` as an array or comma-separated string.

Click tags above the library to filter. Selecting several tags matches items
that have **all** selected tags. Tag filters combine with search, item type,
collection, and pagination. Choose **All tags** to clear the tag filter.

The delete button opens a confirmation dialog. Confirming permanently removes
the item, its tag assignments, uploaded file, and any captured tweet metadata and
photos. This cannot be undone. Collection records and unrelated items remain.
Storage deletion is retried through a durable D1 cleanup record if R2 is
unavailable, and a delayed cleanup pass catches uploads that were in flight when
an item was deleted. Pending cleanup is retried on later API requests.

Click an item card to open its modal. Links have an explicit **Open original site**
action inside the modal; uploaded images can be previewed and files downloaded.

All saved-item cards use equal dimensions at a given viewport size. Long titles
and tags are clipped; tweet preview text is capped at 320 characters and line
clamped. The full captured text remains available in **View saved post**.

## Twitter / X archives

New `twitter.com` and `x.com` post links (including mobile and `/i/web/status/`
links) trigger a background archive after the link is safely saved. The phone
capture endpoint behaves the same way. Apply migration `0002_tweet_archives.sql`
locally or remotely before running this version.

Cerberus uses [FxTwitter’s public API](https://github.com/FxEmbed/FxEmbed/wiki/Status-Fetch-API)
without an API key to retrieve the post. This sends the post ID to FxTwitter.
It captures the username, display name, UTC post date, full returned post text,
and attached photos. Metadata stays in D1; original-resolution photo bytes are
copied from Twitter’s image CDN into your private R2 bucket. Viewing a saved
archive reads only D1/R2, so a later account deletion or switch to private does
not remove captured content. The original URL remains available separately.

The UI shows **Archiving**, **Archived**, **Incomplete archive**, or **Archive
failed**. Open **View saved post** to read the snapshot and view its local images.
A failed retrieval keeps the link. Retry fills missing images without replacing
already saved text or photos; a complete snapshot is immutable. Retry can also
recover an interrupted job after two minutes. Existing links saved before this
feature are unchanged; re-save a post to archive it.

Archives depend on the public post being retrievable when saved. Private,
already deleted, or provider-blocked posts cannot be recovered. Replies, quoted
posts, threads, videos, and animated GIFs are outside this first version; video
attachments are flagged in the saved view. Up to 16 photos are attempted, at
10 MB per image and 40 MB total. Missing or oversized images produce an explicit
incomplete status, while preserving text and any successful downloads.

Outbound requests use fixed API/CDN hosts, reject redirects, have time and byte
limits, and send no account cookies or credentials. The UI/API access protection
described below also needs to cover `/api/tweet-photos/*` and archive endpoints.

## Checks

```sh
npm run check             # Formatting, generated types, TypeScript, production build
npm run test:storage      # Quota boundaries, races, failed writes, and deletion refunds
npm run test:tweets       # Deterministic snapshot, retry, and media-security checks
npm run test:integration  # Build and exercise a real local Worker with isolated D1/R2
npm run format            # Format source and configuration
```

Integration checks cover collections, Inbox defaults, URL/form capture, moving,
search, file/image round trips, safe delivery headers, invalid input, upload and
request limits, same-origin mutation checks, rate limiting, and missing resources.
An optional `VAULT_LIVE_TWEET` environment variable enables a live-provider check
using a public post with an image in the isolated integration library.
Their disposable storage path is printed; they never modify the development library.
Generated Worker/route types, local storage, and build output are ignored by Git.

## Deployment (not configured yet)

No resources have been provisioned and nothing has been deployed. The D1 ID in
`wrangler.jsonc` is a placeholder. Provision one D1 database and one private R2
bucket, update the database ID, and apply migrations remotely before deployment.
The R2 binding is now `FILES` rather than the scaffold’s `IMAGES` binding.

The app has no owner authentication yet. Before using a public domain, protect
all UI and API paths with an owner-only access layer (for example Cloudflare
Access), with only the exact `/api/capture` path exempted. File delivery must
also stay protected. Same-origin mutation checks do not replace authentication.
`workers_dev` and `preview_urls` remain disabled; those settings do not secure a
custom domain. Store secrets in Worker secrets or ignored `.dev.vars` files.

The configured Cloudflare rate-limit namespace ID (`1001`) must be unique to this
limiter in your account; adjust it if another Worker already uses that namespace.

## Development and versioning

The initial foundation is **0.0.1**, tagged `v0.0.1`. Use Semantic Versioning:
patch for compatible fixes, minor for additions, major for breaking changes.
During `0.x`, minor releases may change the evolving interface. Bump the version
and create a matching `vX.Y.Z` tag only when a release or bump is requested.

Use `main` as the integration branch and conventional task branches. Follow
`AGENTS.md`: implement, check, obtain explicit user verification, then commit
using a Conventional Commit and merge locally into `main`. Push only when asked.

## Install on iPhone

Open the deployed Cerberus site in Safari, choose **Share → Add to Home Screen**,
and confirm **Cerberus**. The Home Screen shortcut uses the supplied Cerberus artwork
and opens as a standalone app. An existing shortcut may need to be removed and added
again to refresh its name and icon. Installation does not add offline storage.

The Cloudflare Worker, D1 database, and R2 bucket retain their existing infrastructure
names so the renamed app continues to use the same saved library.
