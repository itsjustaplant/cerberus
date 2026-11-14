CREATE TABLE tags (
  name TEXT PRIMARY KEY CHECK(length(name) BETWEEN 1 AND 32)
);
CREATE TABLE item_tags (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag TEXT NOT NULL REFERENCES tags(name),
  PRIMARY KEY(item_id, tag)
);
CREATE INDEX item_tags_tag ON item_tags(tag, item_id);
-- Retain cleanup work until in-flight archive jobs have had time to stop.
CREATE TABLE item_deletions (
  item_id TEXT PRIMARY KEY,
  object_keys TEXT NOT NULL,
  created_at TEXT NOT NULL
);
