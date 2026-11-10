CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 240),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO collections (id, name, description)
VALUES ('inbox', 'Inbox', 'A place for everything you haven’t sorted yet.');

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL DEFAULT 'inbox' REFERENCES collections(id),
  kind TEXT NOT NULL CHECK(kind IN ('link', 'image', 'file')),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  url TEXT,
  object_key TEXT UNIQUE,
  filename TEXT,
  content_type TEXT,
  size INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((kind = 'link' AND url IS NOT NULL AND object_key IS NULL)
    OR (kind IN ('image', 'file') AND object_key IS NOT NULL AND url IS NULL))
);
CREATE INDEX items_collection_date ON items(collection_id, created_at DESC);
CREATE INDEX items_date ON items(created_at DESC);
