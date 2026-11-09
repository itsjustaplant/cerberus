# Vault

A personal collection of bookmarks, links, and images, inspired by are.na.

This repository currently contains the project foundation. Features, acceptance
criteria, authentication, and the data model will be agreed before implementation.

## Stack

- React Router framework mode with server rendering and TypeScript.
- Cloudflare Workers through the Cloudflare Vite plugin.
- D1 (`DB`) for future collection metadata and links.
- R2 (`IMAGES`) for future image objects.
- npm with a committed lockfile; Node.js 24 (see `.nvmrc`).

## Run locally

```sh
npm ci
npm run cf:typegen
npm run dev
```

Open the URL printed by Vite (usually http://127.0.0.1:5173).
The landing page should show **D1 and R2 connected**. Its server loader executes a
read-only D1 query and lists at most one R2 object to verify both bindings.
Unknown paths should show the application's 404 page.

Local development uses emulated storage in `.wrangler/`; no Cloudflare account,
cloud database, or bucket is required. No application tables are created yet.
Generated Worker and route types are ignored by Git and recreated by typecheck.

```sh
npm run check       # Formatting, generated types, TypeScript, production build
npm run preview     # Build and serve locally using the Workers runtime
npm run format     # Format source and configuration
```

## Project layout

- `app/`: document layout, routes, and styles.
- `workers/app.ts`: Worker entry and server context.
- `wrangler.jsonc`: Worker settings and D1/R2 bindings.
- `migrations/`: future versioned SQL migrations.

## Cloud setup (later)

No cloud resources are provisioned and nothing is deployed by initialization.
The D1 ID in `wrangler.jsonc` is a local placeholder.

Before deploying, provision D1 and R2 in your own account, replace the placeholder
ID, and configure a protected domain and owner-only authentication (for example,
Cloudflare Access). The scaffold has no authentication. `workers_dev` and
`preview_urls` are disabled to keep generated public Worker URLs off; those flags
do not provide authentication for a custom domain. Keep the R2 bucket private.
Never commit credentials; use Worker secrets or ignored `.dev.vars` files.

See [Cloudflare's React Router guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)
for the framework integration.

## Development and versioning

The initial package version is `0.0.1`, the initial foundation. Use Semantic
Versioning: patch for compatible fixes, minor for additions, major for breaking
changes (during `0.x`, minor releases may change the evolving interface).
Only bump versions and create matching `vX.Y.Z` tags when a release or bump is
requested. The initial foundation is tagged `v0.0.1`.

Use `main` as the integration branch and conventional task branches such as
`feat/initialize-vault`. Follow `AGENTS.md`: implement and check, obtain explicit
user verification, then make a Conventional Commit and merge locally into `main`.
Push only when requested. The planned foundation commit is
`chore: initialize vault foundation`.
