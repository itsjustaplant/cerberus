import { useEffect, useState } from "react";
import { Popover } from "@cloudflare/kumo/components/popover";
import { Meter } from "@cloudflare/kumo/components/meter";
import { Button } from "./ui/button";
import {
  CaretDownIcon as ChevronDown,
  XIcon as X,
} from "@phosphor-icons/react";
import type { StorageUsage } from "../lib/models";

function formatBytes(bytes: number) {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1000000) return `${(bytes / 1000).toFixed(1)} KB`;
  if (bytes < 1000000000) return `${(bytes / 1000000).toFixed(1)} MB`;
  return `${(bytes / 1000000000).toFixed(2)} GB`;
}

export function StorageMeter({
  usage,
  placement = "header",
}: {
  usage: StorageUsage;
  placement?: "header" | "sidebar";
}) {
  const [highlight, setHighlight] = useState<string | null>(null);
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
    ? `${formatBytes(current.usedBytes)} / ${formatBytes(current.limitBytes)}`
    : "Checking storage…";
  const reserved = current.reservedBytes
    ? ` Includes ${formatBytes(current.reservedBytes)} reserved or unconfirmed.`
    : "";
  const limit = Math.max(1, current.limitBytes);
  const used = Math.min(limit, Math.max(0, current.usedBytes));
  const reservedBytes = Math.min(used, Math.max(0, current.reservedBytes));
  const segments = [
    { key: "stored", label: "Stored", bytes: used - reservedBytes },
    { key: "reserved", label: "Reserved", bytes: reservedBytes },
    { key: "available", label: "Available", bytes: Math.max(0, limit - used) },
  ];
  function bar(compact = false) {
    return (
      <Meter
        label="File storage"
        value={used}
        min={0}
        max={limit}
        showValue={false}
        aria-label="File storage"
        aria-valuetext={label + reserved}
        aria-busy={!current.ready}
        className={`storage-kumo-meter ${compact ? "is-compact" : ""}`}
        trackClassName="storage-meter-track"
        indicatorClassName="storage-meter-indicator"
      />
    );
  }
  return (
    <Popover.Root onOpenChange={() => setHighlight(null)}>
      <Popover.Trigger
        className="storage-trigger"
        aria-label={`Storage details: ${label}${reserved}`}
      >
        <span className="storage-trigger-label">Storage</span>
        {bar(true)}
        <span className="storage-trigger-amount">
          {current.ready ? formatBytes(current.usedBytes) : "Checking…"}
        </span>
        <ChevronDown size={12} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          sideOffset={10}
          side={placement === "sidebar" ? "top" : "bottom"}
          align={placement === "sidebar" ? "start" : "end"}
          collisionPadding={16}
          className="storage-positioner"
        >
          <Popover.Popup className="storage-popup">
            <header className="storage-popup-header">
              <Popover.Title>Storage</Popover.Title>
              <Popover.Close
                className="icon-button"
                aria-label="Close storage details"
              >
                <X size={16} />
              </Popover.Close>
            </header>
            <div className="storage-summary">
              <strong>
                {current.ready ? formatBytes(current.usedBytes) : "Checking…"}
              </strong>
              <span>of {formatBytes(current.limitBytes)}</span>
            </div>
            {bar()}
            <div className="storage-breakdown">
              {segments.map((segment) => (
                <Button
                  key={segment.key}
                  className="storage-category"
                  onPointerEnter={() => setHighlight(segment.key)}
                  onPointerLeave={() => setHighlight(null)}
                  onFocus={() => setHighlight(segment.key)}
                  onBlur={() => setHighlight(null)}
                  onClick={() =>
                    setHighlight(highlight === segment.key ? null : segment.key)
                  }
                  aria-pressed={highlight === segment.key}
                >
                  <span className={`storage-dot segment-${segment.key}`} />
                  <span>{segment.label}</span>
                  <span>
                    {current.ready ? formatBytes(segment.bytes) : "—"}
                  </span>
                </Button>
              ))}
            </div>
            <Popover.Description className="storage-explanation">
              Shared by uploads and archived post images. Reserved space
              includes uploads being saved or awaiting cleanup.
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
