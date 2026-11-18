import { Banner } from "@cloudflare/kumo/components/banner";
import { storageLevel, type StorageUsage } from "../lib/models";

export const STORAGE_NOTICE_TITLES = {
  warning: "Storage is almost full",
  error: "Storage safety limit reached",
};

export function StorageBanner({ usage }: { usage: StorageUsage }) {
  const level = storageLevel(usage.usedBytes);
  if (level === "normal") return null;
  const blocked = level === "error";
  return (
    <Banner
      className="storage-limit-banner"
      variant={blocked ? "error" : "alert"}
      role={blocked ? "alert" : "status"}
      title={STORAGE_NOTICE_TITLES[level]}
      description={
        blocked
          ? "Storage has reached 9.5 GB. New file uploads and archived images are blocked. Delete files to free space. The remaining 0.5 GB is kept as a safety buffer."
          : "Storage has reached 9 GB. New file uploads and archived images will stop at 9.5 GB, keeping 0.5 GB below the 10 GB allowance. Delete files to free space."
      }
    />
  );
}
