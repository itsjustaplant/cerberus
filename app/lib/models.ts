export interface Collection {
  id: string;
  name: string;
  description: string;
  created_at: string;
  count: number;
}

export interface Item {
  id: string;
  collection_id: string;
  kind: "link" | "image" | "file";
  title: string;
  url: string | null;
  filename: string | null;
  content_type: string | null;
  size: number | null;
  created_at: string;
  tweet?: TweetArchive | null;
  tags?: string[];
}

export interface TweetPhoto {
  id: string;
  item_id: string;
  position: number;
  alt_text: string;
  size: number;
}

export interface TweetArchive {
  item_id: string;
  tweet_id: string;
  status: "pending" | "complete" | "partial" | "failed";
  username: string | null;
  display_name: string | null;
  posted_at: string | null;
  post_text: string | null;
  has_video: number;
  archived_at: string | null;
  attempted_at: string;
  error: string | null;
  photos: TweetPhoto[];
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

export interface TagCount {
  name: string;
  count: number;
}

export const MAX_TWEET_PHOTOS = 16;

export const STORAGE_LIMIT_BYTES = 10_000_000_000;
export interface StorageUsage {
  usedBytes: number;
  reservedBytes: number;
  limitBytes: number;
  ready: boolean;
}
