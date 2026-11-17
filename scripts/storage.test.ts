import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./helpers/vault-fixture";
import {
  initializeStorage,
  getStorageUsage,
  reserveStorage,
  writeStoredObject,
  deleteStoredObjects,
  StorageLimitError,
} from "../app/lib/storage.server";
import { STORAGE_LIMIT_BYTES } from "../app/lib/models";
import { createFile } from "../app/lib/vault.server";
import { archiveTweet, getTweetArchive } from "../app/lib/tweets.server";
import { deleteItem, cleanupDeletedObjects } from "../app/lib/deletion.server";
import {
  R2BudgetError,
  R2_OPERATION_LIMITS,
  reserveR2Operation,
  withR2Budget,
} from "../app/lib/r2-budget.server";

test("monthly operation budgets admit only the last available concurrent operation and reset in UTC", async () => {
  const { env, sql } = fixture(false);
  const now = new Date("2026-11-30T23:59:59Z");
  for (const operationClass of ["A", "B"] as const) {
    sql
      .prepare("INSERT INTO r2_operation_usage VALUES (?, ?, ?)")
      .run("2026-11", operationClass, R2_OPERATION_LIMITS[operationClass] - 1);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        reserveR2Operation(env, operationClass, now),
      ),
    );
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      sql
        .prepare(
          "SELECT operations FROM r2_operation_usage WHERE month = ? AND class = ?",
        )
        .get("2026-11", operationClass)!.operations,
      R2_OPERATION_LIMITS[operationClass],
    );
    await reserveR2Operation(
      env,
      operationClass,
      new Date("2026-12-01T00:00:00Z"),
    );
  }
  sql.close();
});

test("exhausted budgets block R2 writes before upload without leaking storage reservations; deletion stays available", async () => {
  const f = fixture(false);
  await initializeStorage(f.env);
  const month = new Date().toISOString().slice(0, 7);
  f.sql
    .prepare("INSERT INTO r2_operation_usage VALUES (?, 'A', ?)")
    .run(month, R2_OPERATION_LIMITS.A);
  const env = withR2Budget(f.env);
  await assert.rejects(createFile(env, fileForm(1)), R2BudgetError);
  assert.equal(f.files.size, 0);
  assert.equal((await getStorageUsage(env)).usedBytes, 0);
  f.files.set("old", new Uint8Array(1));
  await env.FILES.delete("old");
  assert.equal(f.files.size, 0);
  f.sql.close();
});

test("operation accounting fails closed and attempted failures retain their operation charge", async () => {
  const f = fixture(false);
  let calls = 0;
  f.env.FILES.list = async () => {
    calls++;
    throw new Error("R2 unavailable");
  };
  const env = withR2Budget(f.env);
  await assert.rejects(env.FILES.list(), /R2 unavailable/);
  assert.equal(calls, 1);
  assert.equal(
    f.sql.prepare("SELECT operations FROM r2_operation_usage").get()!
      .operations,
    1,
  );
  f.sql.exec("DROP TABLE r2_operation_usage");
  await assert.rejects(env.FILES.list(), /accounting is unavailable/);
  assert.equal(calls, 1);
  f.sql.close();
});

async function nearLimit(remaining: number) {
  const f = fixture();
  await initializeStorage(f.env);
  f.sql
    .prepare(
      "INSERT INTO storage_objects (object_key, owner_id, size, state, created_at) VALUES ('existing', 'other', ?, 'stored', ?)",
    )
    .run(STORAGE_LIMIT_BYTES - remaining, new Date().toISOString());
  return f;
}
function fileForm(bytes: number) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], "sample.bin"));
  return form;
}

test("inventories older R2 objects, including untracked keys, before allowing a write", async () => {
  const { env, sql, files } = fixture(false);
  files.set("legacy/file", new Uint8Array(12));
  await initializeStorage(env);
  const usage = await getStorageUsage(env);
  assert.equal(usage.ready, true);
  assert.equal(usage.usedBytes, 12);
  assert.equal(usage.limitBytes, 10000000000);
  await initializeStorage(env);
  assert.equal((await getStorageUsage(env)).usedBytes, 12);
  sql.close();
});
test("blocks uploads if the initial inventory cannot be checked", async () => {
  const { env, sql } = fixture(false);
  env.FILES.list = async () => {
    throw new Error("Unavailable");
  };
  let writes = 0;
  env.FILES.put = (async () => {
    writes++;
    return null;
  }) as unknown as typeof env.FILES.put;
  await assert.rejects(createFile(env, fileForm(1)), /inventory/);
  assert.equal(writes, 0);
  assert.equal((await getStorageUsage(env)).ready, false);
  sql.close();
});
test("accepts the exact last bytes and rejects one byte beyond the 10 GB cap before R2", async () => {
  const { env, sql, files } = await nearLimit(8);
  await createFile(env, fileForm(8));
  assert.equal((await getStorageUsage(env)).usedBytes, STORAGE_LIMIT_BYTES);
  await assert.rejects(createFile(env, fileForm(1)), StorageLimitError);
  assert.equal(files.size, 1);
  sql.close();
});
test("concurrent reservations cannot oversubscribe the remaining quota", async () => {
  const { env, sql } = await nearLimit(10);
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, (_, n) =>
      reserveStorage(env, `owner${n}`, `key${n}`, 3),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
  assert.equal((await getStorageUsage(env)).usedBytes, STORAGE_LIMIT_BYTES - 1);
  assert.equal((await getStorageUsage(env)).reservedBytes, 9);
  sql.close();
});
test("a database trigger rejects reservations that try to bypass the helper", async () => {
  const { sql } = await nearLimit(0);
  assert.throws(
    () =>
      sql
        .prepare(
          "INSERT INTO storage_objects VALUES ('bypass','owner',1,'reserved',?)",
        )
        .run(new Date().toISOString()),
    /VAULT_STORAGE_LIMIT/,
  );
  sql.close();
});
test("an uncertain PUT remains charged even if an immediate delete succeeds", async () => {
  const { env, sql } = await nearLimit(4);
  env.FILES.put = (async () => {
    throw new Error("Connection lost after send");
  }) as typeof env.FILES.put;
  await assert.rejects(
    writeStoredObject(
      env,
      "owner",
      "uncertain",
      new Uint8Array(4),
      "image/png",
    ),
  );
  await deleteStoredObjects(env, ["uncertain"]);
  assert.equal((await getStorageUsage(env)).usedBytes, STORAGE_LIMIT_BYTES);
  assert.equal((await getStorageUsage(env)).reservedBytes, 4);
  await assert.rejects(
    reserveStorage(env, "next", "next", 1),
    StorageLimitError,
  );
  sql.close();
});
test("deletion frees capacity only after R2 confirms it", async () => {
  const { env, sql } = await nearLimit(4);
  await writeStoredObject(
    env,
    "owner",
    "confirmed",
    new Uint8Array(4),
    "image/png",
  );
  const original = env.FILES.delete;
  env.FILES.delete = async () => {
    throw new Error("Delete failed");
  };
  await assert.rejects(deleteStoredObjects(env, ["confirmed"]));
  assert.equal((await getStorageUsage(env)).usedBytes, STORAGE_LIMIT_BYTES);
  env.FILES.delete = original;
  await deleteStoredObjects(env, ["confirmed"]);
  assert.equal((await getStorageUsage(env)).usedBytes, STORAGE_LIMIT_BYTES - 4);
  sql.close();
});
test("deleting while a PUT settles cannot free a charge using a stale deletion", async () => {
  const { env, sql } = await nearLimit(4);
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let resume!: () => void;
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const put = env.FILES.put.bind(env.FILES);
  env.FILES.put = (async (...args: Parameters<typeof env.FILES.put>) => {
    ready();
    await gate;
    return put(...args);
  }) as typeof env.FILES.put;
  const writing = writeStoredObject(
    env,
    "owner",
    "overlap",
    new Uint8Array(4),
    "image/png",
  );
  await started;
  env.FILES.delete = async () => {
    resume();
    await writing;
  };
  await deleteStoredObjects(env, ["overlap"]);
  assert.equal((await getStorageUsage(env)).usedBytes, STORAGE_LIMIT_BYTES);
  sql.close();
});
test("a failed metadata transaction cleans up the file and refunds confirmed storage", async () => {
  const { env, sql, files } = await nearLimit(4);
  sql.exec(
    "CREATE TRIGGER reject_item BEFORE INSERT ON items BEGIN SELECT RAISE(ABORT, 'metadata failed'); END;",
  );
  await assert.rejects(createFile(env, fileForm(4)), /metadata failed/);
  assert.equal(files.size, 0);
  assert.equal((await getStorageUsage(env)).usedBytes, STORAGE_LIMIT_BYTES - 4);
  sql.close();
});
test("tweet photos share the quota; the post text survives when images cannot fit", async () => {
  const { env, sql, files } = await nearLimit(1);
  const fetcher = (async (url: RequestInfo | URL) =>
    String(url).includes("api.fxtwitter.com")
      ? Response.json({
          code: 200,
          tweet: {
            id: "123",
            author: { name: "Example", screen_name: "example" },
            text: "Preserve this text",
            created_timestamp: 1700000000,
            media: {
              photos: [{ url: "https://pbs.twimg.com/media/image.png" }],
            },
          },
        })
      : new Response(new Uint8Array(4), {
          headers: { "Content-Type": "image/png" },
        })) as typeof fetch;
  await archiveTweet(env, "post", fetcher);
  const archive = await getTweetArchive(env, "post");
  assert.equal(archive?.status, "partial");
  assert.equal(archive.post_text, "Preserve this text");
  assert.match(archive.error!, /10 GB/);
  assert.equal(files.size, 0);
  sql.close();
});
test("deleting an uploaded file restores its capacity and leaves other owners charged", async () => {
  const { env, sql } = await nearLimit(4);
  const item = await createFile(env, fileForm(4));
  await deleteItem(env, item.id);
  assert.equal((await getStorageUsage(env)).usedBytes, STORAGE_LIMIT_BYTES - 4);
  sql
    .prepare("UPDATE item_deletions SET created_at='2000-01-01T00:00:00.000Z'")
    .run();
  await cleanupDeletedObjects(env);
  assert.equal((await getStorageUsage(env)).usedBytes, STORAGE_LIMIT_BYTES - 4);
  sql.close();
});
