CREATE TABLE storage_quota (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  limit_bytes INTEGER NOT NULL DEFAULT 10000000000 CHECK(limit_bytes = 10000000000),
  charged_bytes INTEGER NOT NULL DEFAULT 0 CHECK(charged_bytes >= 0),
  initialized INTEGER NOT NULL DEFAULT 0 CHECK(initialized IN (0, 1)),
  scan_token TEXT,
  scan_started_at TEXT
);
INSERT INTO storage_quota (id) VALUES (1);
CREATE TABLE storage_objects (
  object_key TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  size INTEGER NOT NULL CHECK(size > 0 AND typeof(size) = 'integer'),
  state TEXT NOT NULL CHECK(state IN ('reserved', 'stored', 'uncertain')),
  created_at TEXT NOT NULL
);
CREATE INDEX storage_objects_owner ON storage_objects(owner_id);
CREATE TRIGGER storage_reservation_guard BEFORE INSERT ON storage_objects
WHEN NEW.state = 'reserved' AND NOT EXISTS (
  SELECT 1 FROM storage_quota WHERE id = 1 AND initialized = 1
    AND NEW.size <= limit_bytes - charged_bytes
)
BEGIN
  SELECT RAISE(ABORT, 'VAULT_STORAGE_LIMIT');
END;
CREATE TRIGGER storage_insert AFTER INSERT ON storage_objects BEGIN
  UPDATE storage_quota SET charged_bytes = charged_bytes + NEW.size WHERE id = 1;
END;
CREATE TRIGGER storage_resize AFTER UPDATE OF size ON storage_objects BEGIN
  UPDATE storage_quota SET charged_bytes = charged_bytes + NEW.size - OLD.size WHERE id = 1;
END;
CREATE TRIGGER storage_delete AFTER DELETE ON storage_objects BEGIN
  UPDATE storage_quota SET charged_bytes = charged_bytes - OLD.size WHERE id = 1;
END;
-- Bootstrap also scans R2 before permitting writes, including objects missing from metadata.
INSERT OR IGNORE INTO storage_objects (object_key, owner_id, size, state, created_at)
SELECT object_key, id, size, 'stored', created_at FROM items WHERE object_key IS NOT NULL AND size > 0;
INSERT OR IGNORE INTO storage_objects (object_key, owner_id, size, state, created_at)
SELECT p.object_key, p.item_id, p.size, 'stored', a.attempted_at FROM tweet_photos p
JOIN tweet_archives a ON a.item_id = p.item_id WHERE p.size > 0;
