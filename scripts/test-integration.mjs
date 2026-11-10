import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

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
  assert.match(await page(), /No items yet/);
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
  const pageOne = await page(`/?collection=${collection.id}`);
  const pageTwo = await page(`/?collection=${collection.id}&page=2`);
  assert.match(pageOne, /Library pages/);
  assert.match(pageOne, /Pagination fixture 49/);
  assert.doesNotMatch(pageOne, /Pagination fixture 0</);
  assert.match(pageTwo, /Pagination fixture 0</);
  assert.match(pageTwo, /Previous/);
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
  console.log(
    "PASS: collections, capture defaults, move, search, pagination, file and image persistence, download headers, validation, request limits, CSRF, rate limiting, and 404/405 handling.",
  );
  console.log(`Isolated local test storage: ${storage}`);
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    if (server.exitCode != null) resolve();
    else server.once("exit", resolve);
  });
}
