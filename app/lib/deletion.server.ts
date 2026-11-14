import { deleteStoredObjects } from "./storage.server";
import { MAX_TWEET_PHOTOS } from "./models";
import { InputError } from "./validation.server";

export async function deleteItem(env: Env, id: string) {
  const item = await env.DB.prepare("SELECT object_key FROM items WHERE id = ?")
    .bind(id)
    .first<{ object_key: string | null }>();
  if (!item) throw new InputError("Item not found.", 404);
  const photos = (
    await env.DB.prepare(
      "SELECT object_key FROM tweet_photos WHERE item_id = ?",
    )
      .bind(id)
      .all<{ object_key: string }>()
  ).results;
  const tracked = (
    await env.DB.prepare(
      "SELECT object_key FROM storage_objects WHERE owner_id = ?",
    )
      .bind(id)
      .all<{ object_key: string }>()
  ).results;
  // Ledger keys include uploads that were in flight when deletion began.
  const keys = [
    ...new Set([
      ...(item.object_key ? [item.object_key] : []),
      ...tracked.map((row) => row.object_key),
      ...photos.map((photo) => photo.object_key),
      ...Array.from(
        { length: MAX_TWEET_PHOTOS },
        (_, position) => `archives/${id}/photos/${position}`,
      ),
    ]),
  ];
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR REPLACE INTO item_deletions (item_id, object_keys, created_at) VALUES (?, ?, ?)",
    ).bind(id, JSON.stringify(keys), new Date().toISOString()),
    env.DB.prepare("DELETE FROM item_tags WHERE item_id = ?").bind(id),
    env.DB.prepare("DELETE FROM tweet_photos WHERE item_id = ?").bind(id),
    env.DB.prepare("DELETE FROM tweet_archives WHERE item_id = ?").bind(id),
    env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id),
    env.DB.prepare(
      "DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM item_tags WHERE tag = tags.name)",
    ),
  ]);
  try {
    await deleteStoredObjects(env, keys);
    return { cleanup_pending: false };
  } catch {
    return { cleanup_pending: true };
  }
}

// Retrying an idempotent R2 deletion is safe. The grace period catches late uploads.
export async function cleanupDeletedObjects(env: Env) {
  try {
    const rows = (
      await env.DB.prepare(
        "SELECT item_id, object_keys FROM item_deletions WHERE created_at < ? LIMIT 10",
      )
        .bind(new Date(Date.now() - 60000).toISOString())
        .all<{ item_id: string; object_keys: string }>()
    ).results;
    for (const row of rows) {
      try {
        const tracked = (
          await env.DB.prepare(
            "SELECT object_key, state FROM storage_objects WHERE owner_id = ?",
          )
            .bind(row.item_id)
            .all<{ object_key: string; state: string }>()
        ).results;
        await deleteStoredObjects(env, [
          ...new Set([
            ...(JSON.parse(row.object_keys) as string[]),
            ...tracked.map((object) => object.object_key),
          ]),
        ]);
        if (tracked.some((object) => object.state !== "stored")) continue;
        await env.DB.prepare("DELETE FROM item_deletions WHERE item_id = ?")
          .bind(row.item_id)
          .run();
      } catch {
        /* Leave the durable cleanup record for the next request. */
      }
    }
  } catch (error) {
    console.warn(
      "Storage cleanup will retry later.",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
