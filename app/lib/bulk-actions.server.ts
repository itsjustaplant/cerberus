import { InputError, text } from "./validation.server";
import { collectionExists } from "./vault.server";
import { parseTags, sourceTags } from "./tags.server";
import { deleteItem } from "./deletion.server";
export async function bulkItems(env: Env, fields: Record<string, unknown>) {
  if (
    !Array.isArray(fields.ids) ||
    fields.ids.length < 1 ||
    fields.ids.length > 48 ||
    fields.ids.some(
      (id) => typeof id !== "string" || !/^[a-zA-Z0-9-]+$/.test(id),
    )
  )
    throw new InputError("Select between 1 and 48 items.");
  const ids = [...new Set(fields.ids as string[])];
  const action = text(fields.action, "Action", 20, true);
  const placeholders = ids.map(() => "?").join(",");
  const rows = (
    await env.DB.prepare(
      `SELECT id, url FROM items WHERE id IN (${placeholders})`,
    )
      .bind(...ids)
      .all<{ id: string; url: string | null }>()
  ).results;
  if (rows.length !== ids.length)
    throw new InputError(
      "Some selected items no longer exist. Refresh and try again.",
      409,
    );
  if (action === "move") {
    const collection = text(fields.collection_id, "Collection", 80, true);
    await collectionExists(env, collection);
    await env.DB.prepare(
      `UPDATE items SET collection_id = ? WHERE id IN (${placeholders})`,
    )
      .bind(collection, ...ids)
      .run();
  } else if (action === "tags") {
    const tags = parseTags(fields.tags);
    if (!tags.length) throw new InputError("Enter at least one tag to add.");
    const existing = (
      await env.DB.prepare(
        `SELECT item_id, tag FROM item_tags WHERE item_id IN (${placeholders})`,
      )
        .bind(...ids)
        .all<{ item_id: string; tag: string }>()
    ).results;
    for (const id of ids) {
      const combined = new Set([
        ...tags,
        ...existing.filter((row) => row.item_id === id).map((row) => row.tag),
      ]);
      if (combined.size - Number(combined.has("twitter")) > 10)
        throw new InputError(
          "An item would exceed the 10-tag limit. Remove some tags first.",
        );
    }
    const statements = rows.flatMap((row) =>
      sourceTags(row.url, tags).flatMap((tag) => [
        env.DB.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").bind(
          tag,
        ),
        env.DB.prepare(
          "INSERT OR IGNORE INTO item_tags (item_id, tag) VALUES (?, ?)",
        ).bind(row.id, tag),
      ]),
    );
    await env.DB.batch(statements);
  } else if (action === "delete") {
    const succeeded: string[] = [];
    const failed: { id: string; error: string }[] = [];
    let cleanup_pending = false;
    for (const id of ids) {
      try {
        const result = await deleteItem(env, id);
        succeeded.push(id);
        cleanup_pending ||= result.cleanup_pending;
      } catch {
        failed.push({ id, error: "Could not delete this item. Try again." });
      }
    }
    return { succeeded, failed, cleanup_pending };
  } else throw new InputError("Choose move, tags, or delete.");
  return { succeeded: ids, failed: [] };
}
