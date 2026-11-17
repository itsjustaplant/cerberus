import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function fixture(withPost = true) {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync("migrations/0001_collections.sql", "utf8"));
  sql.exec(readFileSync("migrations/0002_tweet_archives.sql", "utf8"));
  sql.exec(readFileSync("migrations/0003_tags_and_deletion.sql", "utf8"));
  sql.exec(readFileSync("migrations/0004_twitter_tag.sql", "utf8"));
  sql.exec(readFileSync("migrations/0005_storage_quota.sql", "utf8"));
  sql.exec(readFileSync("migrations/0006_r2_operation_budget.sql", "utf8"));
  const files = new Map<string, Uint8Array>();
  function statement(query: string, values: unknown[] = []): unknown {
    return {
      bind: (...args: unknown[]) => statement(query, args),
      first: async () => sql.prepare(query).get(...(values as never[])) || null,
      all: async () => ({
        results: sql.prepare(query).all(...(values as never[])),
      }),
      run: async () => ({
        meta: {
          changes: Number(
            sql.prepare(query).run(...(values as never[])).changes,
          ),
        },
      }),
      execute: () =>
        query.trimStart().startsWith("SELECT")
          ? { results: sql.prepare(query).all(...(values as never[])) }
          : {
              results: [],
              meta: {
                changes: Number(
                  sql.prepare(query).run(...(values as never[])).changes,
                ),
              },
            },
    };
  }
  const env = {
    DB: {
      prepare: statement,
      batch: async (statements: { execute(): unknown }[]) => {
        sql.exec("BEGIN");
        try {
          const result = statements.map((s) => s.execute());
          sql.exec("COMMIT");
          return result;
        } catch (e) {
          sql.exec("ROLLBACK");
          throw e;
        }
      },
    },
    FILES: {
      put: async (key: string, value: Uint8Array | ReadableStream) => {
        files.set(
          key,
          value instanceof Uint8Array
            ? value
            : new Uint8Array(await new Response(value).arrayBuffer()),
        );
      },
      list: async () => ({
        objects: [...files].map(([key, value]) => ({
          key,
          size: value.byteLength,
        })),
        truncated: false,
      }),
      delete: async (keys: string | string[]) => {
        for (const key of typeof keys === "string" ? [keys] : keys)
          files.delete(key);
      },
    },
  } as unknown as Env;
  if (withPost) {
    sql
      .prepare(
        "INSERT INTO items (id, kind, title, url) VALUES ('post', 'link', 'Saved post', 'https://x.com/test/status/123')",
      )
      .run();
    sql
      .prepare(
        "INSERT INTO tweet_archives (item_id, tweet_id, attempted_at) VALUES ('post', '123', ?)",
      )
      .run(new Date().toISOString());
  }
  return { env, sql, files };
}
