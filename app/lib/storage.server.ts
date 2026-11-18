import { InputError } from "./validation.server";
import {
  R2_STORAGE_ALLOWANCE_BYTES,
  STORAGE_LIMIT_BYTES,
  type StorageUsage,
} from "./models";
import { R2BudgetError } from "./r2-budget.server";

type Quota = {
  limit_bytes: number;
  charged_bytes: number;
  initialized: number;
};
export class StorageLimitError extends InputError {
  constructor() {
    super(
      "This upload would exceed the 9.5 GB safety limit. Delete files before adding more.",
      507,
    );
  }
}

async function quota(env: Env) {
  const row = await env.DB.prepare(
    "SELECT limit_bytes, charged_bytes, initialized FROM storage_quota WHERE id = 1",
  ).first<Quota>();
  if (!row || row.limit_bytes !== R2_STORAGE_ALLOWANCE_BYTES)
    throw new InputError(
      "Storage accounting is unavailable. Uploads are blocked.",
      503,
    );
  return row;
}

export async function initializeStorage(env: Env) {
  if ((await quota(env)).initialized) return;
  const token = crypto.randomUUID();
  const claimed = await env.DB.prepare(
    "UPDATE storage_quota SET scan_token = ?, scan_started_at = ? WHERE id = 1 AND initialized = 0 AND (scan_token IS NULL OR scan_started_at < ?)",
  )
    .bind(
      token,
      new Date().toISOString(),
      new Date(Date.now() - 120000).toISOString(),
    )
    .run();
  if (!claimed.meta.changes)
    throw new InputError(
      "Storage inventory is being checked. Try again shortly.",
      503,
    );
  try {
    let cursor: string | undefined;
    do {
      const page = await env.FILES.list({ limit: 1000, cursor });
      const statements = page.objects
        .filter((object) => object.size > 0)
        .map((object) => {
          const owner =
            object.key.match(/^(?:items|archives)\/([^/]+)/)?.[1] ||
            "untracked";
          return env.DB.prepare(
            "INSERT INTO storage_objects (object_key, owner_id, size, state, created_at) VALUES (?, ?, ?, 'stored', ?) ON CONFLICT(object_key) DO UPDATE SET size = MAX(storage_objects.size, excluded.size)",
          ).bind(object.key, owner, object.size, new Date().toISOString());
        });
      // Keep each D1 batch comfortably below its binding/statement limits.
      for (let index = 0; index < statements.length; index += 50)
        await env.DB.batch(statements.slice(index, index + 50));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    await env.DB.prepare(
      "UPDATE storage_quota SET initialized = 1, scan_token = NULL WHERE id = 1 AND scan_token = ?",
    )
      .bind(token)
      .run();
  } catch {
    await env.DB.prepare(
      "UPDATE storage_quota SET scan_token = NULL WHERE id = 1 AND scan_token = ?",
    )
      .bind(token)
      .run();
    throw new InputError(
      "Storage inventory could not be verified. Uploads are blocked until it succeeds.",
      503,
    );
  }
}

export async function getStorageUsage(env: Env): Promise<StorageUsage> {
  try {
    await initializeStorage(env);
  } catch (error) {
    if (!(error instanceof InputError && error.status === 503)) throw error;
  }
  const row = await quota(env);
  const reserved = await env.DB.prepare(
    "SELECT COALESCE(SUM(size), 0) AS bytes FROM storage_objects WHERE state != 'stored'",
  ).first<{ bytes: number }>();
  return {
    usedBytes: row.charged_bytes,
    reservedBytes: reserved?.bytes || 0,
    limitBytes: STORAGE_LIMIT_BYTES,
    ready: !!row.initialized,
  };
}

export async function reserveStorage(
  env: Env,
  ownerId: string,
  key: string,
  size: number,
) {
  if (!Number.isSafeInteger(size) || size <= 0)
    throw new InputError("Invalid file size.");
  if (size > STORAGE_LIMIT_BYTES) throw new StorageLimitError();
  await initializeStorage(env);
  try {
    // A single SQLite statement plus the database trigger is the authoritative gate.
    const result = await env.DB.prepare(
      "INSERT INTO storage_objects (object_key, owner_id, size, state, created_at) SELECT ?, ?, ?, 'reserved', ? WHERE EXISTS (SELECT 1 FROM storage_quota WHERE id = 1 AND initialized = 1 AND ? <= MIN(limit_bytes, ?) - charged_bytes)",
    )
      .bind(
        key,
        ownerId,
        size,
        new Date().toISOString(),
        size,
        STORAGE_LIMIT_BYTES,
      )
      .run();
    // The conditional INSERT also protects databases awaiting the guard migration.
    if (!result.meta.changes) throw new StorageLimitError();
  } catch (error) {
    if (error instanceof Error && error.message.includes("VAULT_STORAGE_LIMIT"))
      throw new StorageLimitError();
    throw error;
  }
}

export async function deleteStoredObjects(env: Env, keys: string[]) {
  if (!keys.length) return;
  const settled: string[] = [];
  // Snapshot settled writers BEFORE deletion, never after an overlapping PUT finishes.
  for (let index = 0; index < keys.length; index += 50) {
    const group = keys.slice(index, index + 50);
    const rows = (
      await env.DB.prepare(
        `SELECT object_key FROM storage_objects WHERE state = 'stored' AND object_key IN (${group.map(() => "?").join(",")})`,
      )
        .bind(...group)
        .all<{ object_key: string }>()
    ).results;
    settled.push(...rows.map((row) => row.object_key));
  }
  await env.FILES.delete(keys);
  for (let index = 0; index < settled.length; index += 50) {
    const group = settled.slice(index, index + 50);
    await env.DB.prepare(
      `DELETE FROM storage_objects WHERE state = 'stored' AND object_key IN (${group.map(() => "?").join(",")})`,
    )
      .bind(...group)
      .run();
  }
}

export async function writeStoredObject(
  env: Env,
  ownerId: string,
  key: string,
  value: Uint8Array,
  contentType: string,
) {
  // Derive the reservation from the exact immutable upload buffer, never a caller/header size.
  const size = value.byteLength;
  await reserveStorage(env, ownerId, key, size);
  let confirmed = false;
  try {
    await env.FILES.put(key, value, { httpMetadata: { contentType } });
    confirmed = true;
    await env.DB.prepare(
      "UPDATE storage_objects SET state = 'stored' WHERE object_key = ? AND state = 'reserved'",
    )
      .bind(key)
      .run();
  } catch (error) {
    if (error instanceof R2BudgetError) {
      // The budget gate rejected the operation before R2 was called.
      await env.DB.prepare("DELETE FROM storage_objects WHERE object_key = ?")
        .bind(key)
        .run();
    } else if (confirmed) {
      // This writer knows its PUT finished, so a confirmed delete can safely free the row.
      try {
        await env.FILES.delete(key);
        await env.DB.prepare("DELETE FROM storage_objects WHERE object_key = ?")
          .bind(key)
          .run();
      } catch {
        /* Retain the charge if cleanup cannot be confirmed. */
      }
    } else {
      // A transport error does not prove that R2 rejected the write. Never expire this charge.
      try {
        await env.DB.prepare(
          "UPDATE storage_objects SET state = 'uncertain' WHERE object_key = ?",
        )
          .bind(key)
          .run();
      } catch {
        /* The existing reservation remains charged. */
      }
    }
    throw error;
  }
}
