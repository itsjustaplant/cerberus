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
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];
