CREATE TABLE tweet_archives (
  item_id TEXT PRIMARY KEY REFERENCES items(id),
  tweet_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'complete', 'partial', 'failed')),
  username TEXT,
  display_name TEXT,
  posted_at TEXT,
  post_text TEXT,
  photo_sources TEXT,
  has_video INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  attempted_at TEXT NOT NULL,
  error TEXT
);
CREATE TABLE tweet_photos (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES tweet_archives(item_id),
  position INTEGER NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  UNIQUE(item_id, position)
);
