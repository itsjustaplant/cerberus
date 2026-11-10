# D1 migrations

`0001_collections.sql` creates collections and items and seeds the default Inbox.
It uses D1 foreign keys and indexes for collection/date ordering.

Run `npm run db:migrate:local` before local development. For deployment, provision
the real database, update `wrangler.jsonc`, then run
`npx wrangler d1 migrations apply vault --remote` with the intended account.
Do not edit an applied migration; add a numbered migration for subsequent changes.
