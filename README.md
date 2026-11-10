# Vault

A quiet, personal home for links, images, and files. Create collections, save
things worth keeping, and sort them whenever you’re ready. The responsive dark
interface uses black, white, and orange, with sharp corners and monospace type
inspired by Lyra. It uses a sidebar on desktop and bottom navigation on phones.

## Stack and storage

- React Router, React, TypeScript, and Cloudflare Workers.
- Base UI for accessible dialogs; Lucide for icons; plain CSS for styling.
- One D1 database (`DB`) holds collections and all item metadata.
- One private R2 bucket (`FILES`, `vault-files`) holds uploaded files and images.
- A seeded **Inbox** collection receives unclassified items. Collections share
  storage; creating one does not provision another database or bucket.
- Files are limited to **10 MB each**. JPEG, PNG, WebP, GIF, and AVIF get image
  previews. Other formats, including SVG and HTML, are served as downloads.
- Links are stored as URLs. Service integrations and remote previews are deferred.

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
are ignored. URLs with embedded credentials are rejected. The endpoint does not
fetch remote content, accept file uploads, or expose your library.

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
| `PATCH /api/items/:id`        | Move using `collection_id`                                                                                              |
| `GET /api/files/:id`          | Preview a supported image or download a file                                                                            |
| `GET /api/files/:id?download` | Force download                                                                                                          |

Lists are server rendered, newest first, with 48 items per page. Search covers
titles, URLs, and filenames; SQLite’s built-in case folding is ASCII oriented.
Metadata is parameterized in D1 queries. Failed metadata writes clean up the
uploaded R2 object. Changing an item’s collection does not duplicate its file.

## Checks

```sh
npm run check             # Formatting, generated types, TypeScript, production build
npm run test:integration  # Build and exercise a real local Worker with isolated D1/R2
npm run format            # Format source and configuration
```

Integration checks cover collections, Inbox defaults, URL/form capture, moving,
search, file/image round trips, safe delivery headers, invalid input, upload and
request limits, same-origin mutation checks, rate limiting, and missing resources.
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
