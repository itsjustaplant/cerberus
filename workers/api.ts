import {
  boundedRequest,
  collectionExists,
  createFile,
  createLink,
  InputError,
  readFields,
  text,
} from "../app/lib/vault.server";
import { MAX_FILE_SIZE } from "../app/lib/models";

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });

export async function api(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  try {
    const capture = path === "/api/capture";
    // UI mutations are same-origin. The capture route deliberately accepts phone shortcuts.
    const origin = request.headers.get("Origin");
    if (
      !capture &&
      !["GET", "HEAD"].includes(request.method) &&
      ((origin && origin !== new URL(request.url).origin) ||
        request.headers.get("Sec-Fetch-Site") === "cross-site")
    )
      return json({ error: "Cross-origin requests are not allowed." }, 403);
    if (capture) {
      if (request.method !== "POST")
        return json({ error: "Use POST with a URL." }, 405, { Allow: "POST" });
      const { success } = await env.CAPTURE_LIMITER.limit({
        key: request.headers.get("CF-Connecting-IP") || "local",
      });
      if (!success)
        return json({ error: "Too many saves. Try again in a minute." }, 429, {
          "Retry-After": "60",
        });
      const body = await boundedRequest(request, 8192);
      return json(
        { item: await createLink(env, await readFields(body), true) },
        201,
      );
    }
    if (path === "/api/collections") {
      if (request.method !== "POST")
        return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
      const fields = await readFields(await boundedRequest(request, 8192));
      const name = text(fields.name, "Name", 80, true);
      const description = text(fields.description, "Description", 240);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO collections (id, name, description) VALUES (?, ?, ?)",
      )
        .bind(id, name, description)
        .run();
      return json({ collection: { id, name, description } }, 201);
    }
    if (path === "/api/items") {
      if (request.method !== "POST")
        return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
      const multipart = request.headers
        .get("Content-Type")
        ?.includes("multipart/form-data");
      const body = await boundedRequest(
        request,
        multipart ? MAX_FILE_SIZE + 65536 : 8192,
      );
      const item = multipart
        ? await createFile(env, await body.formData())
        : await createLink(env, await readFields(body));
      return json({ item }, 201);
    }
    const itemMatch = path.match(/^\/api\/items\/([a-zA-Z0-9-]+)$/);
    if (itemMatch) {
      if (request.method !== "PATCH")
        return json({ error: "Method not allowed." }, 405, { Allow: "PATCH" });
      const fields = await readFields(await boundedRequest(request, 8192));
      const collection = text(fields.collection_id, "Collection", 80, true);
      await collectionExists(env, collection);
      const result = await env.DB.prepare(
        "UPDATE items SET collection_id = ? WHERE id = ?",
      )
        .bind(collection, itemMatch[1])
        .run();
      if (!result.meta.changes) throw new InputError("Item not found.", 404);
      return json({ ok: true });
    }
    const fileMatch = path.match(/^\/api\/files\/([a-zA-Z0-9-]+)$/);
    if (fileMatch) {
      if (!["GET", "HEAD"].includes(request.method))
        return json({ error: "Method not allowed." }, 405, {
          Allow: "GET, HEAD",
        });
      const row = await env.DB.prepare(
        "SELECT object_key, filename, kind, content_type FROM items WHERE id = ? AND object_key IS NOT NULL",
      )
        .bind(fileMatch[1])
        .first<{
          object_key: string;
          filename: string;
          kind: string;
          content_type: string;
        }>();
      if (!row) throw new InputError("File not found.", 404);
      const object = await env.FILES.get(row.object_key);
      if (!object) throw new InputError("File not found.", 404);
      const download =
        new URL(request.url).searchParams.has("download") ||
        row.kind !== "image";
      return new Response(request.method === "HEAD" ? null : object.body, {
        headers: {
          "Content-Type": row.content_type,
          "Content-Length": String(object.size),
          "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(row.filename).replace(/'/g, "%27")}`,
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Cache-Control": "private, no-store",
        },
      });
    }
    return json({ error: "Endpoint not found." }, 404);
  } catch (error) {
    if (error instanceof InputError)
      return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError || error instanceof TypeError)
      return json({ error: "Invalid request body." }, 400);
    console.error("Vault API error", error);
    return json(
      { error: "Could not save your changes. Please try again." },
      500,
    );
  }
}
