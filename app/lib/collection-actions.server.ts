import { InputError, text } from "./validation.server";
import { collectionExists } from "./vault.server";

export async function renameCollection(
  env: Env,
  id: string,
  fields: Record<string, unknown>,
) {
  if (id === "inbox")
    throw new InputError(
      "Inbox is the default collection and cannot be renamed.",
    );
  const name = text(fields.name, "Name", 80, true);
  const result = await env.DB.prepare(
    "UPDATE collections SET name = ? WHERE id = ?",
  )
    .bind(name, id)
    .run();
  if (!result.meta.changes) throw new InputError("Collection not found.", 404);
  return { id, name };
}
export async function removeCollection(
  env: Env,
  id: string,
  fields: Record<string, unknown>,
) {
  if (id === "inbox")
    throw new InputError(
      "Inbox is the default collection and cannot be deleted.",
    );
  await collectionExists(env, id);
  const destination = text(fields.collection_id, "Destination", 80);
  if (destination === id)
    throw new InputError("Choose a different destination collection.");
  if (destination) await collectionExists(env, destination);
  // D1 batches are transactions: moving items and removing the collection succeed together.
  // The conditional delete also protects a collection that gained items since it was opened.
  const statements = [];
  if (destination)
    statements.push(
      env.DB.prepare(
        "UPDATE items SET collection_id = ? WHERE collection_id = ?",
      ).bind(destination, id),
    );
  statements.push(
    env.DB.prepare(
      "DELETE FROM collections WHERE id = ? AND NOT EXISTS (SELECT 1 FROM items WHERE collection_id = ?)",
    ).bind(id, id),
  );
  const results = await env.DB.batch(statements);
  if (!results.at(-1)!.meta.changes)
    throw new InputError(
      "This collection contains items. Choose a destination before deleting it.",
      409,
    );
  return { ok: true, collection_id: destination || null };
}
