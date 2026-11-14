import { useEffect, useState } from "react";
import type { StorageUsage } from "../lib/models";

function formatBytes(bytes: number) {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1000000) return `${(bytes / 1000).toFixed(1)} KB`;
  if (bytes < 1000000000) return `${(bytes / 1000000).toFixed(1)} MB`;
  return `${(bytes / 1000000000).toFixed(2)} GB`;
}

export function StorageMeter({ usage }: { usage: StorageUsage }) {
  const [live, setLive] = useState<StorageUsage | null>(null);
  useEffect(() => {
    setLive(null);
  }, [usage]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/storage", {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result = (await response.json()) as { storage: StorageUsage };
        if (active) setLive(result.storage);
      } catch {
        /* Keep the last known reading. The server still enforces the quota. */
      }
    }
    const interval = setInterval(() => {
      void refresh();
    }, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      controller.abort();
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const current = live || usage;
  const label = current.ready
    ? `${formatBytes(current.usedBytes)} / 10 GB`
    : "Checking storage…";
  const reserved = current.reservedBytes
    ? ` Includes ${formatBytes(current.reservedBytes)} reserved or unconfirmed.`
    : "";
  return (
    <div
      className={`storage-meter ${current.usedBytes >= current.limitBytes ? "storage-full" : ""}`}
      role="meter"
      aria-label="File storage"
      aria-valuemin={0}
      aria-valuemax={current.limitBytes}
      aria-valuenow={Math.min(current.usedBytes, current.limitBytes)}
      aria-valuetext={label + reserved}
      title={label + reserved + " Hard limit: 10,000,000,000 bytes."}
    >
      <span className="storage-reading">
        <span className="storage-label">Storage</span>
        <span>{label}</span>
      </span>
      <span className="storage-track" aria-hidden="true">
        <span
          style={{
            width: `${Math.min(100, (current.usedBytes / current.limitBytes) * 100)}%`,
          }}
        />
      </span>
    </div>
  );
}
