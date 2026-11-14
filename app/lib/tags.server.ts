import type { Item, TagCount } from "./models";
import { isTwitterUrl } from "./tweets.server";
import { InputError } from "./validation.server";

export function parseTags(value: unknown): string[] {
  if (value == null || value === "") return [];
  if (typeof value === "string") {
    if (value.length > 1024) throw new InputError("Tags are too long.");
    value = value.split(",");
  }
  if (!Array.isArray(value) || value.length > 30)
    throw new InputError("Use at most 10 tags.");
  const tags = new Set<string>();
  for (const part of value) {
    if (typeof part !== "string") throw new InputError("Tags must be text.");
    const tag = part
      .normalize("NFKC")
      .trim()
      .replace(/^#/, "")
      .trim()
      .toLowerCase();
    if (!tag) continue;
    if (tag.length > 32 || /[\x00-\x1f\x7f,]/.test(tag))
      throw new InputError(
        "Each tag must be 1–32 characters without commas or control characters.",
      );
    tags.add(tag);
  }
  if (tags.size - Number(tags.has("twitter")) > 10)
    throw new InputError("Use at most 10 tags.");
  return [...tags].sort();
}

export function tagStatements(env: Env, id: string, tags: string[]) {
  return tags.flatMap((tag) => [
    env.DB.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").bind(tag),
    env.DB.prepare("INSERT INTO item_tags (item_id, tag) VALUES (?, ?)").bind(
      id,
      tag,
    ),
  ]);
}

export async function listTags(env: Env, collection: string | null) {
  return (
    await env.DB.prepare(
      `SELECT t.name, COUNT(*) AS count FROM tags t JOIN item_tags it ON it.tag = t.name JOIN items i ON i.id = it.item_id ${collection ? "WHERE i.collection_id = ?" : ""} GROUP BY t.name ORDER BY t.name`,
    )
      .bind(...(collection ? [collection] : []))
      .all<TagCount>()
  ).results;
}

export async function attachTags(env: Env, items: Item[]) {
  if (!items.length) return items;
  const rows = (
    await env.DB.prepare(
      `SELECT item_id, tag FROM item_tags WHERE item_id IN (${items.map(() => "?").join(",")}) ORDER BY tag`,
    )
      .bind(...items.map((item) => item.id))
      .all<{ item_id: string; tag: string }>()
  ).results;
  return items.map((item) => ({
    ...item,
    tags: rows.filter((row) => row.item_id === item.id).map((row) => row.tag),
  }));
}

export function sourceTags(url: string | null, tags: string[]) {
  return url && isTwitterUrl(url)
    ? [...new Set([...tags, "twitter"])].sort()
    : tags;
}
