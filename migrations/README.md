# D1 migrations

Add numbered SQL migrations here once the first feature's data model is agreed.
There is intentionally no application schema in the foundation.

Create a migration with `npx wrangler d1 migrations create vault <name>` and apply
locally with `npm run db:migrate:local`. Local D1 and R2 data live under
`.wrangler/` and must stay out of Git.
