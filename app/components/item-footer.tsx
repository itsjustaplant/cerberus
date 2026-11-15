import { MoveRight, Tag, Trash2 } from "lucide-react";
import type { Collection, Item } from "../lib/models";

export interface ItemActions {
  move: () => void;
  editTags: () => void;
  remove: () => void;
}
export function ItemFooter({
  item,
  collection,
}: {
  item: Item;
  collection?: Collection;
}) {
  const tags = item.tags || [];
  return (
    <>
      <div className="item-tags" aria-label="Tags">
        {tags.slice(0, 2).map((tag) => (
          <span className="tag-label" key={tag} title={tag}>
            #{tag}
          </span>
        ))}
        {tags.length > 2 && (
          <span className="tag-more" title={tags.slice(2).join(", ")}>
            +{tags.length - 2}
          </span>
        )}
      </div>
      <div className="item-collection" title={collection?.name || "Inbox"}>
        <span className="small-dot" />
        <span>{collection?.name || "Inbox"}</span>
      </div>
    </>
  );
}

export function ItemHeaderActions({
  item,
  move,
  editTags,
  remove,
}: { item: Item } & ItemActions) {
  return (
    <div className="item-actions">
      <button
        className="icon-button"
        onClick={editTags}
        aria-label={`Edit tags for ${item.title}`}
        title="Edit tags"
      >
        <Tag size={16} />
      </button>
      <button
        className="icon-button"
        onClick={move}
        aria-label={`Move ${item.title}`}
        title="Move to collection"
      >
        <MoveRight size={16} />
      </button>
      <button
        className="icon-button delete-button"
        onClick={remove}
        aria-label={`Delete ${item.title}`}
        title="Delete item"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
