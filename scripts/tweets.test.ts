import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fixture } from "./helpers/vault-fixture";
import {
  archiveTweet,
  fetchTweet,
  getTweetArchive,
  photoUrl,
  retryTweetArchive,
  tweetIdFromUrl,
} from "../app/lib/tweets.server";
import { parseTags, listTags, sourceTags } from "../app/lib/tags.server";
import { deleteItem, cleanupDeletedObjects } from "../app/lib/deletion.server";
import { createLink, listItems } from "../app/lib/vault.server";

const image = new Uint8Array([137, 80, 78, 71]);
function metadata(photos = ["https://pbs.twimg.com/media/example.png"]) {
  return {
    code: 200,
    tweet: {
      id: "123",
      text: "Original post text.\nSecond line ✓",
      created_timestamp: 1700000000,
      author: { name: "Example Author", screen_name: "example" },
      media: {
        photos: photos.map((url) => ({ url, altText: "An attached image" })),
      },
    },
  };
}
function fakeFetch(payload = metadata(), missing = new Set<string>()) {
  const calls: string[] = [];
  const fetcher = (async (value: RequestInfo | URL) => {
    const url = String(value);
    calls.push(url);
    if (url.startsWith("https://api.fxtwitter.com/"))
      return Response.json(payload);
    if (missing.has(new URL(url).pathname))
      return new Response("", { status: 404 });
    return new Response(image, { headers: { "Content-Type": "image/png" } });
  }) as typeof fetch;
  return { fetcher, calls };
}

test("recognizes X/Twitter status links and ignores lookalikes and non-post paths", () => {
  for (const url of [
    "https://twitter.com/test/status/123?s=20",
    "https://x.com/test/status/123/photo/1",
    "https://mobile.twitter.com/test/status/123",
    "https://x.com/i/web/status/123",
    "https://x.com/i/status/123",
  ])
    assert.equal(tweetIdFromUrl(url), "123");
  for (const url of [
    "https://x.com.evil.test/test/status/123",
    "https://example.com/test/status/123",
    "https://x.com:8443/test/status/123",
    "https://x.com/test",
    "https://x.com/test/status/123/other",
  ])
    assert.equal(tweetIdFromUrl(url), null);
});
test("only downloads original-resolution images from the fixed Twitter image host", () => {
  assert.match(
    photoUrl("https://pbs.twimg.com/media/test.jpg?name=small"),
    /name=orig/,
  );
  for (const url of [
    "http://pbs.twimg.com/media/a.png",
    "https://127.0.0.1/media/a.png",
    "https://pbs.twimg.com.evil.test/media/a.png",
    "https://pbs.twimg.com/profile_images/a.png",
    "https://user:pass@pbs.twimg.com/media/a.png",
  ])
    assert.throws(() => photoUrl(url));
});
test("preserves author, UTC date, exact text, and image bytes independently of source availability", async () => {
  const { env, files, sql } = fixture();
  const { fetcher } = fakeFetch();
  await archiveTweet(env, "post", fetcher);
  const archived = await getTweetArchive(env, "post");
  assert.equal(archived?.status, "complete");
  assert.equal(archived.username, "example");
  assert.equal(archived.display_name, "Example Author");
  assert.equal(archived.posted_at, "2023-11-14T22:13:20.000Z");
  assert.equal(archived.post_text, "Original post text.\nSecond line ✓");
  assert.equal(archived.photos.length, 1);
  assert.deepEqual([...files.values()][0], image);
  const noNetwork = (async () => {
    throw new Error("Account deleted");
  }) as typeof fetch;
  await archiveTweet(env, "post", noNetwork);
  assert.deepEqual(await getTweetArchive(env, "post"), archived);
  const jobs: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => jobs.push(p),
  } as unknown as ExecutionContext;
  assert.equal(await retryTweetArchive(env, "post", ctx), false);
  assert.equal(jobs.length, 0);
  sql.close();
});
test("partial archives keep metadata; retries fill missing images without overwriting original text or refetching saved images", async () => {
  const { env, sql, files } = fixture();
  const payload = metadata([
    "https://pbs.twimg.com/media/one.png",
    "https://pbs.twimg.com/media/two.png",
  ]);
  await archiveTweet(
    env,
    "post",
    fakeFetch(payload, new Set(["/media/two.png"])).fetcher,
  );
  assert.equal((await getTweetArchive(env, "post"))?.status, "partial");
  assert.equal(files.size, 1);
  sql
    .prepare(
      "UPDATE tweet_archives SET status = 'pending' WHERE item_id = 'post'",
    )
    .run();
  const next = fakeFetch({
    ...payload,
    tweet: { ...payload.tweet, text: "Edited post" },
  });
  await archiveTweet(env, "post", next.fetcher);
  const archived = await getTweetArchive(env, "post");
  assert.equal(archived?.status, "complete");
  assert.equal(archived.photos.length, 2);
  assert.equal(archived.post_text, payload.tweet.text);
  assert.equal(next.calls.length, 1);
  assert.match(next.calls[0], /two.png/);
  sql.close();
});
test("unavailable posts fail cleanly and preserve the saved link", async () => {
  const { env, sql } = fixture();
  await archiveTweet(
    env,
    "post",
    (async () => new Response("", { status: 404 })) as typeof fetch,
  );
  assert.equal((await getTweetArchive(env, "post"))?.status, "failed");
  assert.ok(sql.prepare("SELECT id FROM items WHERE id = 'post'").get());
  sql.close();
});
test("text-only and video-only posts save metadata; video omission is explicit", async () => {
  for (const videos of [[], [{ url: "https://video.twimg.com/example.mp4" }]]) {
    const { env, sql } = fixture();
    const payload = metadata([]);
    const fetcher = (async () =>
      Response.json({
        ...payload,
        tweet: { ...payload.tweet, media: { photos: [], videos } },
      })) as typeof fetch;
    await archiveTweet(env, "post", fetcher);
    const archived = await getTweetArchive(env, "post");
    assert.equal(archived?.status, "complete");
    assert.equal(archived.has_video, Number(videos.length > 0));
    sql.close();
  }
});
test("untrusted media hosts and oversized images leave an explicit incomplete archive", async () => {
  for (const source of [
    "https://localhost/private.png",
    "https://pbs.twimg.com/media/large.png",
  ]) {
    const { env, sql, files } = fixture();
    const calls: string[] = [];
    const fetcher = (async (value: RequestInfo | URL) => {
      const url = String(value);
      calls.push(url);
      if (url.includes("api.fxtwitter.com"))
        return Response.json(metadata([source]));
      return new Response(image, {
        headers: {
          "Content-Type": "image/png",
          "Content-Length": String(11 * 1024 * 1024),
        },
      });
    }) as typeof fetch;
    await archiveTweet(env, "post", fetcher);
    assert.equal((await getTweetArchive(env, "post"))?.status, "partial");
    assert.equal(files.size, 0);
    assert.ok(!calls.some((url) => url.includes("localhost")));
    sql.close();
  }
});
test("rejects malformed or mismatched provider metadata and prevents API redirects", async () => {
  await assert.rejects(
    fetchTweet("123", (async () =>
      Response.json({
        code: 200,
        tweet: { ...metadata().tweet, id: "999" },
      })) as typeof fetch),
  );
  await assert.rejects(
    fetchTweet("123", (async () => new Response("not json")) as typeof fetch),
  );
  await assert.rejects(
    fetchTweet(
      "123",
      (async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://evil.example" },
        })) as typeof fetch,
    ),
  );
  await fetchTweet("123", (async (_url: unknown, options: RequestInit) => {
    assert.equal(options.redirect, "manual");
    return Response.json(metadata());
  }) as typeof fetch);
});
test("claims a failed archive once, recovers stale jobs, and does not duplicate active work", async () => {
  const { env, sql } = fixture();
  const jobs: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (job: Promise<unknown>) => jobs.push(job),
  } as unknown as ExecutionContext;
  // Mock network for retry jobs; creation and persistence still use real SQLite statements.
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch().fetcher;
  try {
    assert.equal(await retryTweetArchive(env, "post", ctx), false);
    sql
      .prepare(
        "UPDATE tweet_archives SET attempted_at = '2000-01-01T00:00:00.000Z' WHERE item_id = 'post'",
      )
      .run();
    assert.equal(await retryTweetArchive(env, "post", ctx), true);
    assert.equal(await retryTweetArchive(env, "post", ctx), false);
    await Promise.all(jobs);
    assert.equal((await getTweetArchive(env, "post"))?.status, "complete");
  } finally {
    globalThis.fetch = previousFetch;
    sql.close();
  }
});
test("both UI saves and phone captures schedule an archive; ordinary URLs do not", async () => {
  const { env, sql } = fixture();
  const jobs: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (job: Promise<unknown>) => jobs.push(job),
  } as unknown as ExecutionContext;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch().fetcher;
  try {
    const ordinary = await createLink(
      env,
      { url: "https://example.com" },
      false,
      ctx,
    );
    assert.equal(jobs.length, 0);
    assert.equal(await getTweetArchive(env, ordinary.id), null);
    const fromUi = await createLink(
      env,
      { url: "https://x.com/example/status/123" },
      false,
      ctx,
    );
    const phone = await createLink(
      env,
      {
        url: "https://twitter.com/example/status/123",
        collection_id: "ignored",
      },
      true,
      ctx,
    );
    assert.equal(phone.collection_id, "inbox");
    assert.equal(jobs.length, 2);
    await Promise.all(jobs);
    assert.equal((await getTweetArchive(env, fromUi.id))?.status, "complete");
    assert.equal((await getTweetArchive(env, phone.id))?.status, "complete");
    assert.equal((await listItems(env, null, "Second line", "", 1)).length, 2);
    assert.equal(
      (await listItems(env, null, "example", "link", 1)).filter(
        (item) => item.tweet,
      ).length,
      2,
    );
    assert.ok(
      (await listItems(env, null, "", "", 1)).some(
        (item) => item.tweet?.username === "example",
      ),
    );
  } finally {
    globalThis.fetch = previousFetch;
    sql.close();
  }
});

test("normalizes tags and filters by all selected tags without mixing items", async () => {
  assert.deepEqual(parseTags(" Design, #reading, DESIGN, 旅行 "), [
    "design",
    "reading",
    "旅行",
  ]);
  assert.throws(() => parseTags(["a".repeat(33)]));
  assert.throws(() =>
    parseTags(Array.from({ length: 11 }, (_, n) => String(n))),
  );
  assert.throws(() => parseTags(["bad\nname"]));
  const { env, sql } = fixture();
  await createLink(env, {
    url: "https://example.com/both",
    tags: ["design", "reading"],
  });
  await createLink(env, { url: "https://example.com/one", tags: "design" });
  const results = await listItems(env, null, "", "", 1, ["design", "reading"]);
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].tags, ["design", "reading"]);
  assert.equal(
    (await listTags(env, null)).find((t) => t.name === "design")?.count,
    2,
  );
  sql.close();
});
test("deletes a tweet snapshot, its tags, and R2 images while preserving unrelated items", async () => {
  const { env, sql, files } = fixture();
  await archiveTweet(env, "post", fakeFetch().fetcher);
  const other = await createLink(env, {
    url: "https://example.com",
    tags: "keep",
  });
  await deleteItem(env, "post");
  assert.equal(await getTweetArchive(env, "post"), null);
  assert.equal(files.size, 0);
  assert.equal(
    sql.prepare("SELECT COUNT(*) AS n FROM tweet_photos").get()?.n,
    0,
  );
  assert.ok(sql.prepare("SELECT id FROM items WHERE id = ?").get(other.id));
  assert.equal(
    sql.prepare("SELECT COUNT(*) AS n FROM item_deletions").get()?.n,
    1,
  );
  sql
    .prepare(
      "UPDATE item_deletions SET created_at = '2000-01-01T00:00:00.000Z'",
    )
    .run();
  await cleanupDeletedObjects(env);
  assert.equal(
    sql.prepare("SELECT COUNT(*) AS n FROM item_deletions").get()?.n,
    0,
  );
  await assert.rejects(deleteItem(env, "post"), /not found/);
  sql.close();
});
test("retains durable storage cleanup work if R2 deletion fails", async () => {
  const { env, sql, files } = fixture();
  await archiveTweet(env, "post", fakeFetch().fetcher);
  const deleteOriginal = env.FILES.delete;
  env.FILES.delete = async () => {
    throw new Error("R2 unavailable");
  };
  assert.equal((await deleteItem(env, "post")).cleanup_pending, true);
  assert.equal((await listItems(env, null, "", "")).length, 0);
  assert.equal(files.size, 1);
  sql
    .prepare(
      "UPDATE item_deletions SET created_at = '2000-01-01T00:00:00.000Z'",
    )
    .run();
  env.FILES.delete = deleteOriginal;
  await cleanupDeletedObjects(env);
  assert.equal(files.size, 0);
  sql.close();
});
test("deleting during a photo upload cannot recreate a snapshot or leave the uploaded object", async () => {
  const { env, sql, files } = fixture();
  const putOriginal = env.FILES.put.bind(env.FILES);
  let started!: () => void;
  const isUploading = new Promise<void>((resolve) => {
    started = resolve;
  });
  let resume!: () => void;
  const proceed = new Promise<void>((resolve) => {
    resume = resolve;
  });
  env.FILES.put = (async (...args: Parameters<typeof env.FILES.put>) => {
    started();
    await proceed;
    return putOriginal(...args);
  }) as typeof env.FILES.put;
  const job = archiveTweet(env, "post", fakeFetch().fetcher);
  await isUploading;
  await deleteItem(env, "post");
  resume();
  await job;
  assert.equal(files.size, 0);
  assert.equal(await getTweetArchive(env, "post"), null);
  sql.close();
});

test("adds the Twitter source tag without dropping custom tags and backfills existing Twitter links only", async () => {
  const { env, sql } = fixture();
  const jobs: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (job: Promise<unknown>) => jobs.push(job),
  } as unknown as ExecutionContext;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch().fetcher;
  try {
    const custom = Array.from({ length: 10 }, (_, n) => `tag${n}`);
    const item = await createLink(
      env,
      { url: "https://x.com/example/status/123", tags: custom },
      false,
      ctx,
    );
    await Promise.all(jobs);
    const saved = (await listItems(env, null, "", "", 1, ["twitter"])).find(
      (row) => row.id === item.id,
    )!;
    assert.deepEqual(saved.tags, [...custom, "twitter"]);
    assert.deepEqual(parseTags(saved.tags), [...custom, "twitter"]);
    assert.deepEqual(sourceTags(item.url, []), ["twitter"]);
    assert.deepEqual(sourceTags("https://x.com.evil.test/user", []), []);
    await createLink(env, { url: "https://example.com/plain" });
    sql.exec(readFileSync("migrations/0004_twitter_tag.sql", "utf8"));
    assert.ok(
      sql
        .prepare(
          "SELECT tag FROM item_tags WHERE item_id='post' AND tag='twitter'",
        )
        .get(),
    );
    assert.equal(
      (await listItems(env, null, "", "", 1, ["twitter"])).length,
      2,
    );
  } finally {
    globalThis.fetch = previousFetch;
    sql.close();
  }
});
