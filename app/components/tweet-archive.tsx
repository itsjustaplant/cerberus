import { ImageGallery } from "./image-gallery";
import { useState } from "react";
import { ArrowUpRight, Link2, RefreshCw } from "lucide-react";
import { ItemFooter, type ItemActions } from "./item-footer";
import type { Collection, Item, TweetArchive } from "../lib/models";

export function archiveLabel(archive: TweetArchive) {
  return {
    pending: "Archiving…",
    complete: "Archived",
    partial: "Incomplete archive",
    failed: "Archive failed",
  }[archive.status];
}
function postDate(value: string) {
  return (
    new Date(value).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }) + " UTC"
  );
}

export function TweetCard({
  item,
  collection,
  open,
  move,
  editTags,
  remove,
}: {
  item: Item;
  collection?: Collection;
  open: () => void;
} & ItemActions) {
  const archive = item.tweet!;
  const body = (
    archive.post_text ??
    (archive.status === "pending"
      ? "Retrieving post…"
      : "Open to view the archive status or retry.")
  )
    .replace(/\s+/g, " ")
    .trim();
  const characters = Array.from(body);
  const preview =
    characters.length > 320 ? characters.slice(0, 320).join("") + "…" : body;
  return (
    <article
      className="item-card tweet-card"
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("a, button")) open();
      }}
    >
      <button
        className="item-preview tweet-preview"
        onClick={open}
        aria-label={`Open saved post${archive.username ? ` by @${archive.username}` : ""}`}
      >
        <div className="tweet-card-header">
          <Link2 size={15} />
          <strong>
            {archive.username ? `@${archive.username}` : "Twitter / X"}
          </strong>
        </div>
        <time dateTime={archive.posted_at || undefined}>
          {archive.posted_at ? postDate(archive.posted_at) : "—"}
        </time>
        <p>{preview}</p>
        {!!archive.photos.length && (
          <div className="tweet-card-photos">
            {archive.photos.slice(0, 2).map((photo) => (
              <img
                key={photo.id}
                src={`/api/tweet-photos/${photo.id}`}
                alt={photo.alt_text || "Archived post image"}
                loading="lazy"
              />
            ))}
          </div>
        )}
        <span className={`archive-status status-${archive.status}`}>
          {archiveLabel(archive)}
        </span>
      </button>
      <div className="item-info">
        <div className="item-title-row">
          <button className="item-title" onClick={open}>
            View saved post
          </button>
        </div>
        <ItemFooter
          item={item}
          collection={collection}
          move={move}
          editTags={editTags}
          remove={remove}
        />
      </div>
    </article>
  );
}

export function TweetArchiveView({
  item,
  refresh,
}: {
  item: Item;
  refresh: () => void;
}) {
  const archive = item.tweet!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function retry() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/items/${item.id}/archive`, {
        method: "POST",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || "Could not retry the archive.");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="tweet-detail">
      <div className="tweet-author">
        <strong>{archive.display_name || "Twitter / X post"}</strong>
        {archive.username && <span>@{archive.username}</span>}
      </div>
      {archive.posted_at && (
        <time dateTime={archive.posted_at}>{postDate(archive.posted_at)}</time>
      )}
      <span className={`archive-status status-${archive.status}`} role="status">
        {archiveLabel(archive)}
      </span>
      {archive.post_text != null && (
        <p className="tweet-full-text">{archive.post_text}</p>
      )}
      {archive.error && <p className="archive-warning">{archive.error}</p>}
      <ImageGallery
        className="tweet-photo-list"
        images={archive.photos.map((photo, index) => ({
          src: `/api/tweet-photos/${photo.id}`,
          alt: photo.alt_text || `Archived image ${index + 1}`,
        }))}
      />
      {!!archive.has_video && (
        <p className="archive-note">
          This post has video. Videos and animated GIFs are not archived.
        </p>
      )}
      {archive.archived_at && (
        <p className="archive-note">Captured {postDate(archive.archived_at)}</p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="archive-actions">
        <a
          className="button secondary"
          href={item.url!}
          target="_blank"
          rel="noreferrer"
        >
          Original post
          <ArrowUpRight size={14} />
        </a>
        {archive.status !== "complete" && (
          <button className="button secondary" disabled={busy} onClick={retry}>
            <RefreshCw size={14} />
            {busy ? "Retrying…" : "Retry archive"}
          </button>
        )}
      </div>
    </div>
  );
}
