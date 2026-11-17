import {
  DownloadSimpleIcon as ArrowDownToLine,
  ArrowSquareOutIcon as ArrowUpRight,
  FileIcon,
} from "@phosphor-icons/react";
import { ImageGallery } from "./image-gallery";
import type { Item } from "../lib/models";

export function ItemDetail({ item }: { item: Item }) {
  return (
    <div className="item-detail">
      {item.kind === "image" && (
        <ImageGallery
          className="item-detail-image"
          images={[{ src: `/api/files/${item.id}`, alt: item.title }]}
        />
      )}
      {item.kind === "file" && (
        <div className="item-detail-file">
          <FileIcon size={36} />
          <p>{item.filename}</p>
          {item.size != null && (
            <span>
              {(item.size / 1024).toLocaleString("en-GB", {
                maximumFractionDigits: 1,
              })}{" "}
              KB
            </span>
          )}
        </div>
      )}
      {item.url && <p className="item-detail-url">{item.url}</p>}
      {!!item.tags?.length && (
        <div className="item-detail-tags">
          {item.tags.map((tag) => (
            <span key={tag} className="tag-label">
              #{tag}
            </span>
          ))}
        </div>
      )}
      <div className="archive-actions">
        {item.url ? (
          <a
            className="button secondary"
            href={item.url}
            target="_blank"
            rel="noreferrer"
          >
            Open original site
            <ArrowUpRight size={14} />
          </a>
        ) : (
          <a
            className="button secondary"
            href={`/api/files/${item.id}?download`}
          >
            Download file
            <ArrowDownToLine size={14} />
          </a>
        )}
      </div>
    </div>
  );
}
