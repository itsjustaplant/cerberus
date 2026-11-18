import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { UNSAFE_decodeViaTurboStream as decodeRouteData } from "react-router";

// Use a disposable D1/R2 directory so checks never modify the development library.
const storage = await mkdtemp(join(tmpdir(), "vault-integration-"));
const wrangler = "node_modules/wrangler/bin/wrangler.js";
const migrated = spawnSync(
  process.execPath,
  [
    wrangler,
    "d1",
    "migrations",
    "apply",
    "vault",
    "--local",
    "--persist-to",
    storage,
  ],
  { encoding: "utf8" },
);
assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
const port = 18789;
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    wrangler,
    "dev",
    "--config",
    "build/server/wrangler.json",
    "--persist-to",
    storage,
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--inspector-port",
    "0",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let logs = "";
server.stdout.on("data", (chunk) => {
  logs += chunk;
});
server.stderr.on("data", (chunk) => {
  logs += chunk;
});
async function api(path, body, status = 201, method = "POST", headers = {}) {
  const response = await fetch(base + path, {
    method,
    headers:
      body instanceof FormData
        ? headers
        : { "Content-Type": "application/json", ...headers },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result));
  return result;
}
async function page(path = "/") {
  const response = await fetch(base + path);
  assert.equal(response.status, 200);
  return response.text();
}
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    if (server.exitCode != null) throw new Error(logs);
    try {
      const response = await fetch(base);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for Worker startup. */
    }
    await delay(200);
  }
  assert.ok(ready, logs);
  // Collection lifecycle and bulk actions run against disposable storage only.
  const { collection: actionSource } = await api("/api/collections", {
    name: "Actions source",
  });
  const { collection: actionTarget } = await api("/api/collections", {
    name: "Actions target",
  });
  await api(
    `/api/collections/${actionSource.id}`,
    { name: "Renamed source" },
    200,
    "PATCH",
  );
  assert.match(await page(`/collections/${actionSource.id}`), /Renamed source/);
  await api("/api/collections/inbox", {}, 400, "DELETE");
  await api("/api/collections/inbox", { name: "Changed" }, 400, "PATCH");
  await api("/api/collections/missing", {}, 404, "DELETE");
  const { item: actionLink } = await api("/api/items", {
    url: "https://example.com/bulk-fixture",
    collection_id: actionSource.id,
    tags: "original",
  });
  const actionUpload = new FormData();
  actionUpload.set(
    "file",
    new File(["bulk bytes"], "bulk-fixture.txt", { type: "text/plain" }),
  );
  actionUpload.set("collection_id", actionSource.id);
  const { item: actionFile } = await api("/api/items", actionUpload);
  await api(`/api/collections/${actionSource.id}`, {}, 409, "DELETE");
  assert.equal((await fetch(base + `/api/files/${actionFile.id}`)).status, 200);
  await api(
    `/api/collections/${actionSource.id}`,
    { collection_id: actionSource.id },
    400,
    "DELETE",
  );
  await api(
    `/api/collections/${actionSource.id}`,
    { collection_id: "missing" },
    404,
    "DELETE",
  );
  await api(
    `/api/collections/${actionSource.id}`,
    { collection_id: actionTarget.id },
    200,
    "DELETE",
  );
  assert.equal(
    (await fetch(base + `/collections/${actionSource.id}`)).status,
    404,
  );
  assert.match(await page(`/collections/${actionTarget.id}`), /bulk-fixture/);
  assert.equal(
    await (await fetch(base + `/api/files/${actionFile.id}`)).text(),
    "bulk bytes",
  );
  await api(
    `/api/items/${actionLink.id}`,
    { title: "Renamed bulk fixture" },
    200,
    "PATCH",
  );
  assert.match(
    await page(`/collections/${actionTarget.id}`),
    /Renamed bulk fixture/,
  );
  const actionIds = [actionLink.id, actionFile.id];
  // Validate the combined tag count before changing any selected item.
  await api(
    "/api/items/bulk",
    {
      action: "tags",
      ids: actionIds,
      tags: Array.from({ length: 10 }, (_, n) => `extra-${n}`).join(","),
    },
    400,
  );
  assert.doesNotMatch(
    await page(`/collections/${actionTarget.id}`),
    /#extra-0/,
  );
  await api(
    "/api/items/bulk",
    { action: "move", ids: actionIds, collection_id: "missing" },
    404,
  );
  await api(
    "/api/items/bulk",
    { action: "delete", ids: [...actionIds, "missing"] },
    409,
  );
  await api("/api/items/bulk", { action: "delete", ids: [] }, 400);
  await api(
    "/api/items/bulk",
    { action: "delete", ids: Array(49).fill(actionLink.id) },
    400,
  );
  await api("/api/items/bulk", { action: "invalid", ids: actionIds }, 400);
  await api(
    "/api/items/bulk",
    { action: "tags", ids: actionIds, tags: "original, added" },
    200,
  );
  // Repeated additions are idempotent and preserve old tags.
  await api(
    "/api/items/bulk",
    { action: "tags", ids: actionIds, tags: "added" },
    200,
  );
  assert.match(
    await page(`/collections/${actionTarget.id}?tag=original&tag=added`),
    /Renamed bulk fixture/,
  );
  await api(
    "/api/items/bulk",
    { action: "move", ids: actionIds, collection_id: "inbox" },
    200,
  );
  assert.match(await page("/collections/inbox"), /Renamed bulk fixture/);
  await api(`/api/collections/${actionTarget.id}`, {}, 200, "DELETE");
  const deletedActions = await api(
    "/api/items/bulk",
    { action: "delete", ids: actionIds },
    200,
  );
  assert.deepEqual(deletedActions.succeeded.sort(), actionIds.sort());
  assert.deepEqual(deletedActions.failed, []);
  assert.equal((await fetch(base + `/api/files/${actionFile.id}`)).status, 404);
  assert.equal(
    (await (await fetch(base + "/api/storage")).json()).storage.usedBytes,
    0,
  );
  console.log(
    "PASS: collection rename, protected Inbox, required destination, preserved files, item rename, bulk validation/move/additive tags/deletion.",
  );

  const emptyLibrary = await page();
  assert.match(emptyLibrary, /No items yet/);
  assert.match(emptyLibrary, /<title>Cerberus<\/title>/);
  assert.match(
    emptyLibrary,
    /name="apple-mobile-web-app-title" content="Cerberus"/,
  );
  assert.match(
    emptyLibrary,
    /rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon.png"/,
  );
  const manifestResponse = await fetch(base + "/manifest.webmanifest");
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.name, "Cerberus");
  assert.equal(manifest.display, "standalone");
  for (const icon of [
    ...manifest.icons,
    { src: "/apple-touch-icon.png" },
    { src: "/favicon-32.png" },
  ]) {
    const response = await fetch(base + icon.src);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /image\/png/);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }

  assert.doesNotMatch(emptyLibrary, /Save from phone|topbar-save|rail-phone/);
  assert.match(await page("/collections"), /<h1>Collections/);
  // Client navigation uses Single Fetch rather than a document request.
  const collectionsData = await fetch(base + "/collections.data");
  assert.equal(collectionsData.status, 200);
  const decodedCollections = await decodeRouteData(
    collectionsData.body,
    globalThis,
  );
  await decodedCollections.done;
  assert.equal(
    decodedCollections.value["routes/collections"].data.view,
    "collections",
  );
  assert.equal((await fetch(base + "/collections/missing")).status, 404);
  const legacyView = await fetch(base + "/?view=collections", {
    redirect: "manual",
  });
  assert.equal(legacyView.status, 302);
  assert.equal(legacyView.headers.get("Location"), "/collections");
  const { collection } = await api("/api/collections", {
    name: "Research & references",
    description: "Integration fixture",
  });
  const { item: link } = await api("/api/items", {
    url: "https://example.com/a?b=c",
    title: "A useful reference",
    collection_id: collection.id,
  });
  assert.equal(link.collection_id, collection.id);
  const collectionPath = `/collections/${collection.id}`;
  assert.match(await page(collectionPath), /A useful reference/);
  assert.match(
    await page(`${collectionPath}?q=useful&kind=link`),
    /A useful reference/,
  );
  assert.doesNotMatch(
    await page(`${collectionPath}?q=no-matching-result`),
    /A useful reference/,
  );
  const legacyCollection = await fetch(
    base + `/?collection=${collection.id}&q=useful&kind=link`,
    { redirect: "manual" },
  );
  assert.equal(legacyCollection.status, 302);
  assert.equal(
    legacyCollection.headers.get("Location"),
    `${collectionPath}?q=useful&kind=link`,
  );
  assert.match(
    await page(`/?collection=${collection.id}`),
    /A useful reference/,
  );
  const { item: captured } = await api("/api/capture", {
    url: "https://example.org/from-phone",
    collection_id: collection.id,
  });
  assert.equal(
    captured.collection_id,
    "inbox",
    "Open capture must always use Inbox",
  );
  const formCapture = await fetch(base + "/api/capture", {
    method: "POST",
    body: new URLSearchParams({
      url: "https://example.net",
      title: "Phone form",
    }),
  });
  assert.equal(formCapture.status, 201);
  await api(
    "/api/items/" + captured.id,
    { collection_id: collection.id },
    200,
    "PATCH",
  );
  assert.match(await page(`/?collection=${collection.id}`), /example.org/);
  assert.doesNotMatch(await page("/?collection=inbox"), /example.org/);
  assert.match(await page("/?q=useful&kind=link"), /A useful reference/);
  assert.doesNotMatch(await page("/?q=nonexistent-term"), /A useful reference/);
  const payload = "A small file. Unicode: ✓";
  const form = new FormData();
  form.set("file", new File([payload], "notes.txt", { type: "text/plain" }));
  form.set("collection_id", collection.id);
  const { item: file } = await api("/api/items", form);
  assert.equal(file.kind, "file");
  const download = await fetch(base + "/api/files/" + file.id);
  assert.equal(download.status, 200);
  assert.equal(await download.text(), payload);
  assert.match(download.headers.get("Content-Disposition"), /^attachment/);
  assert.equal(download.headers.get("X-Content-Type-Options"), "nosniff");
  // A real 1×1 PNG validates image storage and the preview delivery headers.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5GkAAAAASUVORK5CYII=",
    "base64",
  );
  const imageForm = new FormData();
  imageForm.set("file", new File([png], "tiny.png", { type: "image/png" }));
  const { item: image } = await api("/api/items", imageForm);
  assert.equal(image.kind, "image");
  assert.equal(image.collection_id, "inbox");
  const preview = await fetch(base + "/api/files/" + image.id);
  assert.equal(preview.headers.get("Content-Type"), "image/png");
  assert.match(preview.headers.get("Content-Disposition"), /^inline/);
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), png);
  const forceDownload = await fetch(
    base + "/api/files/" + image.id + "?download",
  );
  assert.match(forceDownload.headers.get("Content-Disposition"), /^attachment/);
  const head = await fetch(base + "/api/files/" + image.id, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  await api("/api/items", { url: "javascript:alert(1)" }, 400);
  await api("/api/items", { url: "https://user:password@example.com" }, 400);
  await api("/api/collections", { name: " " }, 400);
  await api("/api/collections", { name: "x".repeat(81) }, 400);
  await api(
    "/api/items",
    { url: "https://example.com", collection_id: "missing" },
    404,
  );
  await api("/api/items/missing", { collection_id: "inbox" }, 404, "PATCH");
  await api(
    "/api/items/" + link.id,
    { collection_id: "missing" },
    404,
    "PATCH",
  );
  await api("/api/items", { url: "https://example.com" }, 403, "POST", {
    Origin: "https://another.example",
  });
  await api("/api/items", { url: "https://example.com" }, 403, "POST", {
    "Sec-Fetch-Site": "cross-site",
  });
  await api(
    "/api/capture",
    { url: "https://example.com/" + "a".repeat(8300) },
    413,
  );
  const malformed = await fetch(base + "/api/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  const big = new FormData();
  big.set("file", new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.bin"));
  await api("/api/items", big, 413);
  const empty = new FormData();
  empty.set("file", new File([], "empty.txt"));
  await api("/api/items", empty, 400);
  const svgForm = new FormData();
  svgForm.set(
    "file",
    new File(['<svg onload="alert(1)"></svg>'], "test.svg", {
      type: "image/svg+xml",
    }),
  );
  const { item: svg } = await api("/api/items", svgForm);
  assert.equal(
    svg.kind,
    "file",
    "Active formats must download rather than render inline",
  );
  const svgDownload = await fetch(base + "/api/files/" + svg.id);
  assert.equal(
    svgDownload.headers.get("Content-Type"),
    "application/octet-stream",
  );
  assert.match(svgDownload.headers.get("Content-Disposition"), /^attachment/);
  assert.equal((await fetch(base + "/api/files/missing")).status, 404);
  assert.equal((await fetch(base + "/?collection=missing")).status, 404);
  assert.equal((await fetch(base + "/api/capture")).status, 405);
  for (let index = 0; index < 50; index++) {
    await api("/api/items", {
      url: `https://example.com/pagination/${index}`,
      title: `Pagination fixture ${index}`,
      collection_id: collection.id,
    });
  }
  const pageOne = await page(collectionPath);
  const pageTwo = await page(`${collectionPath}?page=2`);
  assert.match(pageOne, new RegExp(`href="${collectionPath}\\?page=2"`));
  assert.match(pageTwo, new RegExp(`href="${collectionPath}"`));
  assert.match(pageOne, /Library pages/);
  assert.match(pageOne, /Pagination fixture 49/);
  assert.doesNotMatch(pageOne, /Pagination fixture 0</);
  assert.match(pageTwo, /Pagination fixture 0</);
  assert.match(pageTwo, /Previous/);
  const itemPath = `${collectionPath}/items/${link.id}`;
  assert.equal((await fetch(base + itemPath)).status, 200);
  const itemData = await fetch(base + `${itemPath}.data`);
  assert.equal(itemData.status, 200);
  const decodedItem = await decodeRouteData(itemData.body, globalThis);
  await decodedItem.done;
  const focusedPage = decodedItem.value["routes/item"].data;
  assert.equal(focusedPage.focusedItem.id, link.id);
  assert.equal(focusedPage.focusedItem.collection_id, collection.id);
  assert.ok(
    !focusedPage.items.some((item) => item.id === link.id),
    "Direct item links must work beyond the first page",
  );
  assert.equal(
    (await fetch(base + `/collections/inbox/items/${link.id}`)).status,
    404,
  );
  assert.equal(
    (await fetch(base + `${collectionPath}/items/missing`)).status,
    404,
  );
  const { item: tagged } = await api("/api/items", {
    url: "https://example.com/tagged",
    title: "Tagged item fixture",
    tags: "Design, #Reading, design",
  });
  const { item: untagged } = await api("/api/items", {
    url: "https://example.com/untagged",
    title: "Untagged item fixture",
  });
  assert.match(await page("/?tag=design&tag=reading"), /Tagged item fixture/);
  assert.doesNotMatch(
    await page("/?tag=design&tag=reading"),
    /Untagged item fixture/,
  );
  await api(
    `/api/items/${tagged.id}`,
    { tags: ["Research", "旅行"] },
    200,
    "PATCH",
  );
  assert.match(await page("/?tag=research"), /Tagged item fixture/);
  assert.doesNotMatch(await page("/?tag=design"), /Tagged item fixture/);
  await api(`/api/items/${tagged.id}`, { tags: [] }, 200, "PATCH");
  assert.doesNotMatch(await page("/?tag=research"), /Tagged item fixture/);
  await api(
    "/api/items",
    { url: "https://example.com", tags: ["a".repeat(33)] },
    400,
  );
  await api(
    `/api/items/${tagged.id}`,
    { tags: Array.from({ length: 11 }, (_, n) => `tag${n}`) },
    400,
    "PATCH",
  );
  await api(`/api/items/${tagged.id}`, {}, 400, "PATCH");
  await api(`/api/items/${tagged.id}`, {}, 403, "DELETE", {
    Origin: "https://evil.example",
  });
  await api(`/api/items/${tagged.id}`, {}, 200, "DELETE");
  await api(`/api/items/${tagged.id}`, {}, 404, "DELETE");
  await api(`/api/items/${tagged.id}`, { tags: ["gone"] }, 404, "PATCH");
  assert.doesNotMatch(
    await page("/?q=Tagged+item+fixture"),
    /class="item-title">Tagged item fixture/,
  );
  await api(`/api/items/${file.id}`, {}, 200, "DELETE");
  assert.equal((await fetch(base + `/api/files/${file.id}`)).status, 404);
  assert.match(await page("/?q=Untagged"), /Untagged item fixture/);
  // Optional real-provider check runs only in this disposable library.
  if (process.env.VAULT_LIVE_TWEET) {
    const { item: tweet } = await api("/api/items", {
      url: process.env.VAULT_LIVE_TWEET,
    });
    let archive;
    for (let attempt = 0; attempt < 150; attempt++) {
      const response = await fetch(base + `/api/items/${tweet.id}/archive`);
      assert.equal(response.status, 200);
      archive = (await response.json()).archive;
      if (archive.status !== "pending") break;
      await delay(200);
    }
    if (archive.status !== "complete") {
      const diagnostics = await fetch(
        base + "/cdn-cgi/local/explorer/api/local/observability/query",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sql: "SELECT level, message FROM logs WHERE level IN ('warn', 'error') ORDER BY ts_ms DESC LIMIT 5",
          }),
        },
      );
      console.error("Archive diagnostics:", await diagnostics.text());
    }
    assert.equal(archive.status, "complete", JSON.stringify(archive));
    assert.ok(archive.username && archive.posted_at && archive.post_text);
    assert.ok(
      archive.photos.length > 0,
      "Live sample should have an attached photo",
    );
    for (const photo of archive.photos) {
      const response = await fetch(base + `/api/tweet-photos/${photo.id}`);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get("Content-Type").startsWith("image/"));
      assert.equal((await response.arrayBuffer()).byteLength, photo.size);
      assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    }
    assert.match(await page("/?tag=twitter"), /View saved post/);
    await api(`/api/items/${tweet.id}`, { tags: [] }, 200, "PATCH");
    assert.match(await page("/?tag=twitter"), /View saved post/);
    console.log(
      `PASS: live post archive — @${archive.username}, ${archive.photos.length} image(s) copied to R2 and served by Cerberus.`,
    );
    const deletedPhotoIds = archive.photos.map((photo) => photo.id);
    await api(`/api/items/${tweet.id}`, {}, 200, "DELETE");
    assert.equal(
      (await fetch(base + `/api/items/${tweet.id}/archive`)).status,
      404,
    );
    for (const id of deletedPhotoIds)
      assert.equal((await fetch(base + `/api/tweet-photos/${id}`)).status, 404);
    console.log("PASS: archived post and image deletion.");
  }
  let limited = false;
  for (let i = 0; i < 40; i++) {
    const response = await fetch(base + "/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/rate-test" }),
    });
    if (response.status === 429) {
      limited = true;
      assert.equal(response.headers.get("Retry-After"), "60");
      break;
    }
    assert.equal(response.status, 201);
  }
  assert.ok(limited, "Capture rate limit should reject excess requests");
  const quotaBefore = (await (await fetch(base + "/api/storage")).json())
    .storage;
  assert.equal(quotaBefore.limitBytes, 9_500_000_000);
  assert.ok(quotaBefore.ready);
  const seeded = await fetch(
    base +
      "/cdn-cgi/local/explorer/api/d1/database/00000000-0000-0000-0000-000000000000/raw",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: "INSERT INTO storage_objects (object_key, owner_id, size, state, created_at) SELECT 'quota-test-existing', 'quota-test', MIN(limit_bytes, 9500000000) - charged_bytes - 16, 'stored', ? FROM storage_quota WHERE id = 1",
        params: [new Date().toISOString()],
      }),
    },
  );
  assert.ok(seeded.ok, await seeded.text());
  const warningPage = await (await fetch(base + "/")).text();
  assert.ok(warningPage.includes("Storage is almost full"));
  const uploads = await Promise.all(
    Array.from({ length: 12 }, async (_, n) => {
      const form = new FormData();
      form.set("file", new File([new Uint8Array(4)], `quota-${n}.bin`));
      const response = await fetch(base + "/api/items", {
        method: "POST",
        body: form,
      });
      return { status: response.status, body: await response.json() };
    }),
  );
  assert.equal(uploads.filter((upload) => upload.status === 201).length, 4);
  assert.equal(uploads.filter((upload) => upload.status === 507).length, 8);
  const full = (await (await fetch(base + "/api/storage")).json()).storage;
  assert.equal(full.usedBytes, 9_500_000_000);
  const blockedPage = await (await fetch(base + "/")).text();
  assert.ok(blockedPage.includes("Storage safety limit reached"));
  const successful = uploads.find((upload) => upload.status === 201);
  await api(`/api/items/${successful.body.item.id}`, {}, 200, "DELETE");
  const afterDelete = (await (await fetch(base + "/api/storage")).json())
    .storage;
  assert.equal(afterDelete.usedBytes, 9_499_999_996);
  const exact = new FormData();
  exact.set("file", new File([new Uint8Array(4)], "last-four.bin"));
  await api("/api/items", exact);
  const extraByte = new FormData();
  extraByte.set("file", new File([new Uint8Array(1)], "over.bin"));
  await api("/api/items", extraByte, 507);
  console.log(
    "PASS: strict 9.5 GB quota under concurrent HTTP uploads, exact boundary, and deletion recovery.",
  );
  // Exhaust the operation budgets in the disposable database, never production.
  await api(`/api/items/${image.id}`, {}, 200, "DELETE");
  const beforeBudgetBlock = (await (await fetch(base + "/api/storage")).json())
    .storage.usedBytes;
  const budgetSeed = await fetch(
    base +
      "/cdn-cgi/local/explorer/api/d1/database/00000000-0000-0000-0000-000000000000/raw",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: "INSERT INTO r2_operation_usage (month, class, operations) VALUES (?, 'A', 900000), (?, 'B', 9000000) ON CONFLICT(month, class) DO UPDATE SET operations = excluded.operations",
        params: [
          new Date().toISOString().slice(0, 7),
          new Date().toISOString().slice(0, 7),
        ],
      }),
    },
  );
  assert.ok(budgetSeed.ok, await budgetSeed.text());
  const budgetUpload = new FormData();
  budgetUpload.set("file", new File([new Uint8Array(1)], "budget-blocked.bin"));
  await api("/api/items", budgetUpload, 503);
  assert.equal(
    (await (await fetch(base + "/api/storage")).json()).storage.usedBytes,
    beforeBudgetBlock,
  );
  assert.equal((await fetch(base + `/api/files/${svg.id}`)).status, 503);
  await api(`/api/items/${svg.id}`, {}, 200, "DELETE");
  console.log(
    "PASS: monthly operation budgets block HTTP uploads/downloads without leaked reservations and permit deletion.",
  );
  console.log(
    "PASS: tags, deletion, collections, capture defaults, move, search, pagination, file and image persistence, download headers, validation, request limits, CSRF, rate limiting, and 404/405 handling.",
  );
  console.log(`Isolated local test storage: ${storage}`);
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    if (server.exitCode != null) resolve();
    else server.once("exit", resolve);
  });
}
