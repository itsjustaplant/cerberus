import { useEffect, useState } from "react";
import type { StorageUsage } from "../lib/models";

export function useStorageUsage(usage: StorageUsage): StorageUsage {
  const [live, setLive] = useState<{
    source: StorageUsage;
    value: StorageUsage;
  } | null>(null);
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
        if (active) setLive({ source: usage, value: result.storage });
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
  }, [usage]);
  return live?.source === usage ? live.value : usage;
}
