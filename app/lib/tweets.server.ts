import {
  writeStoredObject,
  deleteStoredObjects,
  StorageLimitError,
} from "./storage.server";
import { IMAGE_TYPES, MAX_FILE_SIZE, MAX_TWEET_PHOTOS } from "./models";
import type { Item, TweetArchive, TweetPhoto } from "./models";

const HOSTS = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
  "m.twitter.com",
]);
const FIELDS =
  "item_id, tweet_id, status, username, display_name, posted_at, post_text, has_video, archived_at, attempted_at, error";
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
type PhotoSource = { url: string; alt: string };
type ArchiveRow = TweetArchive & { photo_sources: string | null };

export function isTwitterUrl(value: string) {
  const url = new URL(value);
  return HOSTS.has(url.hostname) && !url.port;
}

export function tweetIdFromUrl(value: string) {
  const url = new URL(value);
  if (!HOSTS.has(url.hostname) || url.port) return null;
  return (
    url.pathname.match(
      /^\/(?:[a-zA-Z0-9_]{1,15}|i\/web|i)\/status\/(\d{1,25})(?:\/(?:photo|video)\/\d+)?\/?$/,
    )?.[1] || null
  );
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid post data.");
  return value as Record<string, unknown>;
}
function string(value: unknown, max: number) {
  if (typeof value !== "string" || value.length > max)
    throw new Error("Invalid post data.");
  return value;
}

export function photoUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "pbs.twimg.com" ||
    url.port ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/media/")
  )
    throw new Error("Unsupported image source.");
  url.searchParams.set("name", "orig");
  return url.href;
}

async function readLimited(response: Response, limit: number) {
  if (!response.body || Number(response.headers.get("Content-Length")) > limit)
    throw new Error("Archive response is too large.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Archive response is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function fetchTweet(
  id: string,
  fetcher: typeof fetch = fetch,
  signal = AbortSignal.timeout(12000),
) {
  if (!/^\d{1,25}$/.test(id)) throw new Error("Invalid post ID.");
  const response = await fetcher(`https://api.fxtwitter.com/status/${id}`, {
    redirect: "manual",
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "Vault/0.0.1 (personal post archive)",
    },
  });
  if (!response.ok)
    throw new Error(
      "The post is unavailable or the archive provider could not be reached.",
    );
  const payload = record(
    JSON.parse(
      new TextDecoder().decode(await readLimited(response, 1024 * 1024)),
    ),
  );
  if (payload.code !== 200)
    throw new Error("The post is unavailable or private.");
  const tweet = record(payload.tweet);
  if (tweet.id !== id)
    throw new Error("The provider returned a different post.");
  const author = record(tweet.author);
  const username = string(author.screen_name, 15);
  if (!/^[a-zA-Z0-9_]{1,15}$/.test(username))
    throw new Error("Invalid post author.");
  const postedAt =
    typeof tweet.created_timestamp === "number"
      ? new Date(tweet.created_timestamp * 1000)
      : new Date(string(tweet.created_at, 100));
  if (!Number.isFinite(postedAt.getTime()))
    throw new Error("Invalid post date.");
  const media = tweet.media == null ? {} : record(tweet.media);
  const photos = media.photos ?? [];
  if (!Array.isArray(photos)) throw new Error("Invalid image list.");
  return {
    username,
    displayName: string(author.name ?? username, 200),
    postedAt: postedAt.toISOString(),
    text: string(tweet.text, 100000),
    photos: photos.map((value): PhotoSource => {
      const photo = record(value);
      return {
        url: string(photo.url, 4096),
        alt:
          typeof photo.altText === "string" ? photo.altText.slice(0, 4000) : "",
      };
    }),
    hasVideo: Array.isArray(media.videos) && media.videos.length > 0,
  };
}

export async function getTweetArchive(env: Env, id: string) {
  const archive = await env.DB.prepare(
    `SELECT ${FIELDS} FROM tweet_archives WHERE item_id = ?`,
  )
    .bind(id)
    .first<TweetArchive>();
  if (!archive) return null;
  archive.photos = (
    await env.DB.prepare(
      "SELECT id, item_id, position, alt_text, size FROM tweet_photos WHERE item_id = ? ORDER BY position",
    )
      .bind(id)
      .all<TweetPhoto>()
  ).results;
  return archive;
}

export async function attachTweetArchives(env: Env, items: Item[]) {
  if (!items.length) return items;
  const placeholders = items.map(() => "?").join(",");
  const ids = items.map((item) => item.id);
  const [archives, photos] = await env.DB.batch([
    env.DB.prepare(
      `SELECT ${FIELDS} FROM tweet_archives WHERE item_id IN (${placeholders})`,
    ).bind(...ids),
    env.DB.prepare(
      `SELECT id, item_id, position, alt_text, size FROM tweet_photos WHERE item_id IN (${placeholders}) ORDER BY position`,
    ).bind(...ids),
  ]);
  const byId = new Map(
    (archives.results as unknown as TweetArchive[]).map((archive) => [
      archive.item_id,
      {
        ...archive,
        photos: (photos.results as unknown as TweetPhoto[]).filter(
          (photo) => photo.item_id === archive.item_id,
        ),
      },
    ]),
  );
  return items.map((item) => ({ ...item, tweet: byId.get(item.id) || null }));
}

// Metadata and image bytes are copied once; retries fill gaps without replacing a saved snapshot.
export async function archiveTweet(
  env: Env,
  itemId: string,
  fetcher: typeof fetch = fetch,
) {
  let row: ArchiveRow | null = null;
  try {
    row = await env.DB.prepare("SELECT * FROM tweet_archives WHERE item_id = ?")
      .bind(itemId)
      .first<ArchiveRow>();
    if (!row || row.status !== "pending") return;
    const signal = AbortSignal.timeout(25000);
    if (row.post_text == null) {
      const tweet = await fetchTweet(
        row.tweet_id,
        fetcher,
        AbortSignal.any([signal, AbortSignal.timeout(12000)]),
      );
      const updated = await env.DB.prepare(
        "UPDATE tweet_archives SET username = ?, display_name = ?, posted_at = ?, post_text = ?, photo_sources = ?, has_video = ?, archived_at = ? WHERE item_id = ?",
      )
        .bind(
          tweet.username,
          tweet.displayName,
          tweet.postedAt,
          tweet.text,
          JSON.stringify(tweet.photos),
          Number(tweet.hasVideo),
          new Date().toISOString(),
          itemId,
        )
        .run();
      if (!updated.meta.changes) return;
      row = {
        ...row,
        post_text: tweet.text,
        photo_sources: JSON.stringify(tweet.photos),
      };
    }
    const sources = JSON.parse(row.photo_sources || "[]") as PhotoSource[];
    const stored = (
      await env.DB.prepare(
        "SELECT position, size FROM tweet_photos WHERE item_id = ?",
      )
        .bind(itemId)
        .all<{ position: number; size: number }>()
    ).results;
    let bytes = stored.reduce((n, photo) => n + photo.size, 0);
    let errors = sources.length > MAX_TWEET_PHOTOS ? 1 : 0;
    let quotaExceeded = false;
    for (const [position, source] of sources
      .slice(0, MAX_TWEET_PHOTOS)
      .entries()) {
      if (stored.some((photo) => photo.position === position)) continue;
      const key = `archives/${itemId}/photos/${position}-${crypto.randomUUID()}`;
      try {
        if (signal.aborted) throw new Error("Archive timed out.");
        const response = await fetcher(photoUrl(source.url), {
          redirect: "manual",
          signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        });
        const type =
          response.headers.get("Content-Type")?.split(";")[0].trim() || "";
        if (!response.ok || !IMAGE_TYPES.includes(type))
          throw new Error("Image is unavailable.");
        const data = await readLimited(
          response,
          Math.min(MAX_FILE_SIZE, MAX_TOTAL_BYTES - bytes),
        );
        if (!data.byteLength) throw new Error("Image is empty.");
        if (
          !(await env.DB.prepare("SELECT id FROM items WHERE id = ?")
            .bind(itemId)
            .first())
        )
          return;
        await writeStoredObject(env, itemId, key, data, type);
        try {
          const inserted = await env.DB.prepare(
            "INSERT INTO tweet_photos (id, item_id, position, object_key, content_type, size, alt_text) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM items WHERE id = ?)",
          )
            .bind(
              crypto.randomUUID(),
              itemId,
              position,
              key,
              type,
              data.byteLength,
              source.alt,
              itemId,
            )
            .run();
          if (!inserted.meta.changes) {
            await deleteStoredObjects(env, [key]);
            return;
          }
        } catch (error) {
          await deleteStoredObjects(env, [key]);
          throw error;
        }
        bytes += data.byteLength;
      } catch (error) {
        errors++;
        if (error instanceof StorageLimitError) {
          quotaExceeded = true;
          break;
        }
      }
    }
    const status = errors ? "partial" : "complete";
    await env.DB.prepare(
      "UPDATE tweet_archives SET status = ?, error = ? WHERE item_id = ?",
    )
      .bind(
        status,
        quotaExceeded
          ? "Post text saved. Images could not be archived because the 10 GB storage limit is reached. Delete files and retry."
          : errors
            ? "Post text saved. Some images could not be archived. Retry to save missing images."
            : null,
        itemId,
      )
      .run();
  } catch (error) {
    console.warn(
      "Tweet archive retrieval failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    // Never throw a background failure back into link saving or discard captured data.
    try {
      await env.DB.prepare(
        "UPDATE tweet_archives SET status = ?, error = ? WHERE item_id = ?",
      )
        .bind(
          row?.post_text != null ? "partial" : "failed",
          "Could not archive this post. It may be private, deleted, or temporarily unavailable. Retry later.",
          itemId,
        )
        .run();
    } catch (error) {
      console.error("Could not record tweet archive failure", error);
    }
  }
}

export async function retryTweetArchive(
  env: Env,
  itemId: string,
  ctx: ExecutionContext,
) {
  const result = await env.DB.prepare(
    "UPDATE tweet_archives SET status = 'pending', attempted_at = ?, error = NULL WHERE item_id = ? AND (status IN ('partial', 'failed') OR (status = 'pending' AND attempted_at < ?))",
  )
    .bind(
      new Date().toISOString(),
      itemId,
      new Date(Date.now() - 120000).toISOString(),
    )
    .run();
  if (!result.meta.changes) return false;
  ctx.waitUntil(archiveTweet(env, itemId));
  return true;
}
