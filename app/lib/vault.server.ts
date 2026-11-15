import type { Collection, Item } from "./models";
import { IMAGE_TYPES, MAX_FILE_SIZE } from "./models";

import {
  archiveTweet,
  tweetIdFromUrl,
  attachTweetArchives,
} from "./tweets.server";

import { InputError, text } from "./validation.server";
import { writeStoredObject, deleteStoredObjects } from "./storage.server";
export { InputError, text } from "./validation.server";
import {
  parseTags,
  tagStatements,
  attachTags,
  sourceTags,
} from "./tags.server";

export function normalizeUrl(value: unknown) {
  const raw = text(value, "URL", 4096, true);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InputError("Enter a complete URL, including https://.");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new InputError(
      "Use an HTTP or HTTPS URL without embedded credentials.",
    );
  return url.href;
}

export async function collectionExists(env: Env, id: string) {
  const row = await env.DB.prepare("SELECT id FROM collections WHERE id = ?")
    .bind(id)
    .first();
  if (!row) throw new InputError("Collection not found.", 404);
}

export async function listCollections(env: Env) {
  return (
    await env.DB.prepare(
      `SELECT c.*, COUNT(i.id) AS count FROM collections c
    LEFT JOIN items i ON i.collection_id = c.id GROUP BY c.id
    ORDER BY c.id = 'inbox' DESC, c.created_at DESC, c.id`,
    ).all<Collection>()
  ).results;
}

export async function listItems(
  env: Env,
  collection: string | null,
  query: string,
  kind: string,
  page = 1,
  tags: string[] = [],
) {
  const clauses: string[] = [];
  const values: string[] = [];
  if (collection) {
    clauses.push("collection_id = ?");
    values.push(collection);
  }
  if (query) {
    clauses.push(
      "(instr(lower(title), lower(?)) > 0 OR instr(lower(COALESCE(url, '')), lower(?)) > 0 OR instr(lower(COALESCE(filename, '')), lower(?)) > 0 OR EXISTS (SELECT 1 FROM tweet_archives a WHERE a.item_id = items.id AND (instr(lower(COALESCE(a.post_text, '')), lower(?)) > 0 OR instr(lower(COALESCE(a.username, '')), lower(?)) > 0)))",
    );
    values.push(query, query, query, query, query);
  }
  if (["link", "image", "file"].includes(kind)) {
    clauses.push("kind = ?");
    values.push(kind);
  }
  for (const tag of tags) {
    clauses.push(
      "EXISTS (SELECT 1 FROM item_tags WHERE item_id = items.id AND tag = ?)",
    );
    values.push(tag);
  }
  const items = (
    await env.DB.prepare(
      `SELECT id, collection_id, kind, title, url, filename, content_type, size, created_at FROM items ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY created_at DESC, id DESC LIMIT 49 OFFSET ?`,
    )
      .bind(...values, (page - 1) * 48)
      .all<Item>()
  ).results;
  return attachTweetArchives(env, await attachTags(env, items));
}

export async function getItem(env: Env, collectionId: string, itemId: string) {
  const item = await env.DB.prepare(
    "SELECT id, collection_id, kind, title, url, filename, content_type, size, created_at FROM items WHERE id = ? AND collection_id = ?",
  )
    .bind(itemId, collectionId)
    .first<Item>();
  if (!item) return null;
  return (await attachTweetArchives(env, await attachTags(env, [item])))[0];
}

export async function createLink(
  env: Env,
  fields: Record<string, unknown>,
  inboxOnly = false,
  ctx?: ExecutionContext,
) {
  const url = normalizeUrl(fields.url);
  const title =
    text(fields.title, "Title", 200) || new URL(url).hostname.slice(0, 200);
  const collection = inboxOnly
    ? "inbox"
    : text(fields.collection_id, "Collection", 80) || "inbox";
  await collectionExists(env, collection);
  const id = crypto.randomUUID();
  const tags = sourceTags(url, parseTags(fields.tags));
  const tweetId = tweetIdFromUrl(url);
  const insert = env.DB.prepare(
    "INSERT INTO items (id, collection_id, kind, title, url) VALUES (?, ?, ?, ?, ?)",
  ).bind(id, collection, "link", title, url);
  const statements = [insert, ...tagStatements(env, id, tags)];
  if (tweetId) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO tweet_archives (item_id, tweet_id, attempted_at) VALUES (?, ?, ?)",
      ).bind(id, tweetId, new Date().toISOString()),
    );
  }
  await env.DB.batch(statements);
  if (tweetId) {
    if (ctx) ctx.waitUntil(archiveTweet(env, id));
    else await archiveTweet(env, id);
  }
  return { id, collection_id: collection, kind: "link", title, url };
}

export async function createFile(env: Env, form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size)
    throw new InputError("Choose a nonempty file.");
  if (file.size > MAX_FILE_SIZE)
    throw new InputError("Files must be 10 MB or smaller.", 413);
  const filename = text(file.name, "Filename", 240, true).replace(
    /[\r\n\x00-\x1f]/g,
    "_",
  );
  const title = text(form.get("title"), "Title", 200) || filename.slice(0, 200);
  const collection =
    text(form.get("collection_id"), "Collection", 80) || "inbox";
  await collectionExists(env, collection);
  const id = crypto.randomUUID();
  const tags = parseTags(form.get("tags"));
  const key = `items/${id}`;
  const kind = IMAGE_TYPES.includes(file.type) ? "image" : "file";
  const type = kind === "image" ? file.type : "application/octet-stream";
  await writeStoredObject(
    env,
    id,
    key,
    new Uint8Array(await file.arrayBuffer()),
    type,
  );
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO items (id, collection_id, kind, title, object_key, filename, content_type, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(id, collection, kind, title, key, filename, type, file.size),
      ...tagStatements(env, id, tags),
    ]);
  } catch (error) {
    await deleteStoredObjects(env, [key]);
    throw error;
  }
  return { id, collection_id: collection, kind, title };
}

// Bound the actual stream as well as Content-Length before parsing multipart or JSON.
export async function boundedRequest(request: Request, limit: number) {
  if (Number(request.headers.get("Content-Length")) > limit)
    throw new InputError("Request is too large.", 413);
  if (!request.body) throw new InputError("A request body is required.");
  const reader = request.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new InputError("Request is too large.", 413);
      }
      chunks.push(new Uint8Array(value).buffer);
    }
  } finally {
    reader.releaseLock();
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: new Blob(chunks),
  });
}

export async function readFields(
  request: Request,
): Promise<Record<string, unknown>> {
  const type = request.headers.get("Content-Type") || "";
  if (type.includes("application/json")) {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new InputError("Expected a JSON object.");
    return body as Record<string, unknown>;
  }
  if (
    type.includes("application/x-www-form-urlencoded") ||
    type.includes("multipart/form-data")
  )
    return Object.fromEntries(await request.formData());
  throw new InputError("Send JSON or form data.", 415);
}
