import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Maximize2,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderPlus,
  Grid2X2,
  Inbox,
  Link2,
  Plus,
  Search,
  Smartphone,
  Upload,
  X,
  Image as ImageIcon,
  MoveRight,
  Layers,
} from "lucide-react";
import { Form, Link, useNavigate, useRevalidator } from "react-router";
import { StorageMeter } from "../components/storage-meter";
import { getStorageUsage } from "../lib/storage.server";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import { ItemDetail } from "../components/item-detail";
import { ItemFooter, type ItemActions } from "../components/item-footer";
import { TweetCard, TweetArchiveView } from "../components/tweet-archive";
import type { Route } from "./+types/home";
import { cloudflareContext } from "../lib/cloudflare.server";
import {
  collectionExists,
  InputError,
  listCollections,
  listItems,
} from "../lib/vault.server";
import { listTags, parseTags } from "../lib/tags.server";
import type { Collection, Item } from "../lib/models";
import { MAX_FILE_SIZE } from "../lib/models";

export function meta() {
  return [
    { title: "Vault" },
    {
      name: "description",
      content: "Links, images, and files.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const params = new URL(request.url).searchParams;
  const collection = params.get("collection");
  if (collection) {
    try {
      await collectionExists(env, collection);
    } catch (error) {
      if (error instanceof InputError)
        throw new Response("Collection not found", { status: 404 });
      throw error;
    }
  }
  const query = (params.get("q") || "").slice(0, 200);
  const kind = ["link", "image", "file"].includes(params.get("kind") || "")
    ? params.get("kind")!
    : "";
  const page = Math.min(
    100000,
    Math.max(1, Math.floor(Number(params.get("page")) || 1)),
  );
  let selectedTags: string[];
  try {
    selectedTags = parseTags(params.getAll("tag"));
  } catch (error) {
    if (error instanceof InputError)
      throw new Response(error.message, { status: 400 });
    throw error;
  }
  const [collections, results, tags, storage] = await Promise.all([
    listCollections(env),
    listItems(env, collection, query, kind, page, selectedTags),
    listTags(env, collection),
    getStorageUsage(env),
  ]);
  return {
    collections,
    storage,
    tags,
    selectedTags,
    items: results.slice(0, 48),
    page,
    hasMore: results.length > 48,
    collection,
    query,
    kind,
    view: params.get("view") || "items",
  };
}

function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <Layers size={20} strokeWidth={1.6} />
    </span>
  );
}
function plural(count: number) {
  return `${count} ${count === 1 ? "item" : "items"}`;
}
function bytes(size: number | null) {
  return size == null
    ? ""
    : size < 1024 * 1024
      ? `${Math.max(1, Math.round(size / 1024))} KB`
      : `${(size / 1024 / 1024).toFixed(1)} MB`;
}
function iconFor(kind: string, size = 20) {
  return kind === "link" ? (
    <Link2 size={size} />
  ) : kind === "image" ? (
    <ImageIcon size={size} />
  ) : (
    <FileIcon size={size} />
  );
}

type Modal = "collection" | "save" | "phone" | null;

export default function Home({ loaderData: data }: Route.ComponentProps) {
  const [modal, setModal] = useState<Modal>(null);
  const [moving, setMoving] = useState<Item | null>(null);
  const [tagging, setTagging] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [notice, setNotice] = useState("");
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const activeItem = data.items.find((item) => item.id === activeItemId);
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const hasPendingArchives =
    !data.storage.ready ||
    data.items.some(
      (item) =>
        item.tweet?.status === "pending" &&
        Date.now() - Date.parse(item.tweet.attempted_at) < 120000,
    );
  useEffect(() => {
    if (!hasPendingArchives) return;
    const interval = setInterval(() => {
      if (revalidator.state === "idle") void revalidator.revalidate();
    }, 2000);
    return () => clearInterval(interval);
  }, [hasPendingArchives, revalidator]);
  const selected = data.collections.find((c) => c.id === data.collection);
  const total = data.collections.reduce((n, c) => n + c.count, 0);
  const inbox = data.collections.find((c) => c.id === "inbox");
  const collectionsView = data.view === "collections";
  const title = collectionsView ? "Collections" : selected?.name || "All items";
  const description =
    !collectionsView && selected?.id !== "inbox" ? selected?.description : "";
  function saved(message: string) {
    setNotice(message);
    setModal(null);
    setMoving(null);
    void revalidator.revalidate();
  }
  function filterUrl(kind: string, tags = data.selectedTags) {
    const params = new URLSearchParams();
    if (data.collection) params.set("collection", data.collection);
    if (data.query) params.set("q", data.query);
    if (kind) params.set("kind", kind);
    for (const tag of tags) params.append("tag", tag);
    return `/?${params}`;
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <Mark />
          <span>
            vault<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace-label">LIBRARY</div>
        <nav aria-label="Library">
          <Link
            className={`nav-link ${!data.collection && !collectionsView ? "selected" : ""}`}
            to="/"
          >
            <Grid2X2 size={17} />
            All items<span className="nav-count">{total}</span>
          </Link>
          <Link
            className={`nav-link ${data.collection === "inbox" ? "selected" : ""}`}
            to="/?collection=inbox"
          >
            <Inbox size={18} />
            Inbox<span className="nav-count">{inbox?.count || 0}</span>
          </Link>
          <Link
            className={`nav-link ${collectionsView ? "selected" : ""}`}
            to="/?view=collections"
          >
            <Folder size={18} />
            Collections
            <span className="nav-count">{data.collections.length}</span>
          </Link>
        </nav>
        <div className="sidebar-section">
          <span>YOUR COLLECTIONS</span>
          <button
            className="icon-button"
            aria-label="New collection"
            onClick={() => setModal("collection")}
          >
            <Plus size={16} />
          </button>
        </div>
        <nav className="collection-nav" aria-label="Collections">
          {data.collections
            .filter((c) => c.id !== "inbox")
            .map((c, i) => (
              <Link
                key={c.id}
                className={`nav-link ${data.collection === c.id ? "selected" : ""}`}
                to={`/?collection=${c.id}`}
              >
                <span className={`collection-dot tone-${i % 4}`} />
                <span className="truncate">{c.name}</span>
                <span className="nav-count">{c.count}</span>
              </Link>
            ))}
          <button
            className="nav-link new-collection"
            onClick={() => setModal("collection")}
          >
            <Plus size={17} />
            New collection
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button className="phone-button" onClick={() => setModal("phone")}>
            <Smartphone size={18} />
            <span>Save from phone</span>
            <ArrowUpRight size={15} />
          </button>
          <div className="profile">
            <span className="avatar">A</span>
            <span>Vault</span>
            <span className="version">v0.0.1</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <Link to="/" className="mobile-brand">
            <Mark />
            vault.
          </Link>
          <div className="breadcrumb">
            <span>Library</span>
            <ChevronRight size={14} />
            <span>{title}</span>
          </div>
          <div className="topbar-actions">
            <StorageMeter usage={data.storage} />
            <button
              className="icon-button topbar-search"
              aria-label="Search items"
              onClick={async () => {
                if (collectionsView) await navigate("/");
                searchRef.current?.focus();
              }}
            >
              <Search size={18} />
            </button>
            <span className="top-divider" />
            <button
              className="button primary topbar-save"
              aria-label="Save item"
              onClick={() => setModal("save")}
            >
              <Plus size={16} />
              <span>Save item</span>
            </button>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <h1>
                {title}
                <span className="heading-dot">.</span>
              </h1>
              {description && <p className="page-description">{description}</p>}
            </div>
            {collectionsView ? (
              <button
                className="button secondary"
                onClick={() => setModal("collection")}
              >
                <FolderPlus size={16} />
                New collection
              </button>
            ) : (
              <span className="item-total">
                {plural(selected?.count ?? total)}
              </span>
            )}
          </div>
          {notice && (
            <div className="notice" role="status">
              <Check size={16} />
              {notice}
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {collectionsView ? (
            <div className="collections-grid">
              {data.collections.map((c, i) => (
                <CollectionCard key={c.id} collection={c} tone={i % 4} />
              ))}
              <button
                className="collection-card create-card"
                onClick={() => setModal("collection")}
              >
                <Plus size={24} />
                <span>New collection</span>
              </button>
            </div>
          ) : (
            <>
              {!data.collection &&
                !data.query &&
                !data.kind &&
                !data.selectedTags.length && (
                  <section
                    className="collections-section"
                    aria-label="Collections"
                  >
                    <div className="section-heading">
                      <h2>
                        Collections{" "}
                        <span>
                          {data.collections.length.toString().padStart(2, "0")}
                        </span>
                      </h2>
                      <Link to="/?view=collections" className="text-link">
                        View all
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                    <div className="collection-strip">
                      {data.collections.slice(0, 3).map((c, i) => (
                        <CollectionCard
                          key={c.id}
                          collection={c}
                          tone={i % 4}
                        />
                      ))}
                      <button
                        className="collection-card create-card"
                        onClick={() => setModal("collection")}
                      >
                        <Plus size={22} />
                        <span>New collection</span>
                      </button>
                    </div>
                  </section>
                )}
              <section className="items-section" aria-label="Saved items">
                <div className="section-heading">
                  <h2>
                    {data.collection ? "In this collection" : "Your library"}
                    <span>NEWEST FIRST</span>
                  </h2>
                </div>
                <div className="library-toolbar">
                  <nav className="filter-tabs" aria-label="Item types">
                    {[
                      ["", "Everything"],
                      ["link", "Links"],
                      ["image", "Images"],
                      ["file", "Files"],
                    ].map(([kind, label]) => (
                      <Link
                        key={kind}
                        to={filterUrl(kind)}
                        className={`filter-tab ${data.kind === kind ? "active" : ""}`}
                        aria-current={data.kind === kind ? "page" : undefined}
                      >
                        {label}
                      </Link>
                    ))}
                  </nav>
                  <Form
                    method="get"
                    className="search-form"
                    key={`${data.collection}-${data.query}`}
                    role="search"
                  >
                    {data.collection && (
                      <input
                        type="hidden"
                        name="collection"
                        value={data.collection}
                      />
                    )}
                    {data.kind && (
                      <input type="hidden" name="kind" value={data.kind} />
                    )}
                    {data.selectedTags.map((tag) => (
                      <input key={tag} type="hidden" name="tag" value={tag} />
                    ))}
                    <Search size={16} />
                    <input
                      ref={searchRef}
                      aria-label="Search your library"
                      name="q"
                      defaultValue={data.query}
                      placeholder="Search your library…"
                      maxLength={200}
                    />
                    <button className="sr-only" type="submit">
                      Search
                    </button>
                    {data.query && (
                      <Link
                        className="icon-button"
                        to={filterUrl(data.kind).replace(
                          /([?&])q=[^&]*&?/,
                          "$1",
                        )}
                        aria-label="Clear search"
                      >
                        <X size={14} />
                      </Link>
                    )}
                  </Form>
                </div>
                {(data.tags.length > 0 || data.selectedTags.length > 0) && (
                  <nav className="tag-filters" aria-label="Filter by tags">
                    <Link
                      className={`tag-filter ${data.selectedTags.length ? "" : "active"}`}
                      to={filterUrl(data.kind, [])}
                    >
                      All tags
                    </Link>
                    {[
                      ...new Set([
                        ...data.tags.map((tag) => tag.name),
                        ...data.selectedTags,
                      ]),
                    ]
                      .sort()
                      .map((tag) => (
                        <Link
                          key={tag}
                          className={`tag-filter ${data.selectedTags.includes(tag) ? "active" : ""}`}
                          aria-current={
                            data.selectedTags.includes(tag) ? "page" : undefined
                          }
                          to={filterUrl(
                            data.kind,
                            data.selectedTags.includes(tag)
                              ? data.selectedTags.filter(
                                  (value) => value !== tag,
                                )
                              : [...data.selectedTags, tag],
                          )}
                        >
                          #{tag}
                        </Link>
                      ))}
                  </nav>
                )}
                {data.items.length ? (
                  <div className="items-grid">
                    {data.items.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        collection={data.collections.find(
                          (c) => c.id === item.collection_id,
                        )}
                        move={() => setMoving(item)}
                        editTags={() => setTagging(item)}
                        remove={() => setDeleting(item)}
                        openItem={() => setActiveItemId(item.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-art">
                      <span>
                        <Link2 size={22} />
                      </span>
                      <span>
                        <Inbox size={32} strokeWidth={1.3} />
                      </span>
                      <span>
                        <ImageIcon size={22} />
                      </span>
                    </div>
                    <h3>
                      {data.query || data.kind || data.selectedTags.length
                        ? "No matching items"
                        : "No items yet"}
                    </h3>
                    {(data.query ||
                      data.kind ||
                      data.selectedTags.length > 0) && (
                      <p>Try another search or clear the filters.</p>
                    )}
                    {data.query || data.kind || data.selectedTags.length ? (
                      <Link
                        className="button secondary"
                        to={
                          data.collection
                            ? `/?collection=${data.collection}`
                            : "/"
                        }
                      >
                        Clear filters
                      </Link>
                    ) : (
                      <button
                        className="button primary"
                        onClick={() => setModal("save")}
                      >
                        <Plus size={16} />
                        Save item
                      </button>
                    )}
                  </div>
                )}
                {(data.hasMore || data.page > 1) && (
                  <nav className="pagination" aria-label="Library pages">
                    {data.page > 1 ? (
                      <Link
                        className="button secondary"
                        to={`${filterUrl(data.kind)}&page=${data.page - 1}`}
                      >
                        Previous
                      </Link>
                    ) : (
                      <span />
                    )}
                    <span className="quiet">Page {data.page}</span>
                    {data.hasMore ? (
                      <Link
                        className="button secondary"
                        to={`${filterUrl(data.kind)}&page=${data.page + 1}`}
                      >
                        Next <ArrowRight size={14} />
                      </Link>
                    ) : (
                      <span />
                    )}
                  </nav>
                )}
              </section>
            </>
          )}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile library">
        <Link
          to="/"
          className={!data.collection && !collectionsView ? "active" : ""}
        >
          <Grid2X2 size={20} />
          <span>All items</span>
        </Link>
        <Link
          to="/?collection=inbox"
          className={data.collection === "inbox" ? "active" : ""}
        >
          <Inbox size={21} />
          <span>Inbox</span>
        </Link>
        <Link
          to="/?view=collections"
          className={
            collectionsView || (data.collection && data.collection !== "inbox")
              ? "active"
              : ""
          }
        >
          <Folder size={21} />
          <span>Collections</span>
        </Link>
        <button onClick={() => setModal("save")}>
          <Plus size={22} />
          <span>Save</span>
        </button>
      </nav>
      <SheetShell
        open={!!tagging}
        onClose={() => setTagging(null)}
        title="Edit tags"
        description={tagging?.title}
      >
        {tagging && (
          <EditTags
            item={tagging}
            onSave={() => {
              setTagging(null);
              saved("Tags updated.");
            }}
          />
        )}
      </SheetShell>
      <SheetShell
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete item?"
        description="This permanently removes the item, its uploaded file, and any saved post archive."
      >
        {deleting && (
          <DeleteItem
            item={deleting}
            cancel={() => setDeleting(null)}
            onDelete={(pending) => {
              setDeleting(null);
              setActiveItemId(null);
              saved(
                pending
                  ? "Item deleted. Storage cleanup will retry automatically."
                  : "Item deleted.",
              );
            }}
          />
        )}
      </SheetShell>
      <SheetShell
        open={!!activeItem}
        onClose={() => setActiveItemId(null)}
        title={activeItem?.tweet ? "Saved post" : activeItem?.title || "Item"}
      >
        {activeItem?.tweet ? (
          <TweetArchiveView
            key={activeItem.id}
            item={activeItem}
            refresh={() => {
              void revalidator.revalidate();
            }}
          />
        ) : activeItem ? (
          <ItemDetail key={activeItem.id} item={activeItem} />
        ) : null}
      </SheetShell>
      <SheetShell
        open={modal === "collection"}
        onClose={() => setModal(null)}
        title="New collection"
      >
        <CreateCollection
          onSave={(id) => {
            saved("Collection created.");
            void navigate(`/?collection=${id}`);
          }}
        />
      </SheetShell>
      <SheetShell
        open={modal === "save"}
        onClose={() => setModal(null)}
        title="Save item"
      >
        <SaveItem
          key={modal === "save" ? "open" : "closed"}
          collections={data.collections}
          selected={data.collection || "inbox"}
          onSave={() => saved("Item saved.")}
        />
      </SheetShell>
      <SheetShell
        open={!!moving}
        onClose={() => setMoving(null)}
        title="Move to a collection"
        description={moving?.title || "Choose a collection."}
      >
        {moving && (
          <MoveItem
            item={moving}
            collections={data.collections}
            onSave={() => saved("Item moved.")}
          />
        )}
      </SheetShell>
      <SheetShell
        open={modal === "phone"}
        onClose={() => setModal(null)}
        title="Save from phone"
        description="Send a link from an iOS Shortcut, Android automation, or any HTTP client."
      >
        <PhoneHelp />
      </SheetShell>
    </div>
  );
}

function CollectionCard({
  collection: c,
  tone,
}: {
  collection: Collection;
  tone: number;
}) {
  return (
    <Link
      to={`/?collection=${c.id}`}
      className={`collection-card tone-${tone}`}
    >
      <div className="collection-card-top">
        <span className="folder-tile">
          {c.id === "inbox" ? (
            <Inbox size={22} strokeWidth={1.5} />
          ) : (
            <Folder size={22} strokeWidth={1.5} />
          )}
        </span>
        <ArrowUpRight size={16} />
      </div>
      <div>
        <h3>{c.name}</h3>
        <p>
          {plural(c.count)}
          {c.id === "inbox" && <span className="default-label">DEFAULT</span>}
        </p>
      </div>
    </Link>
  );
}

function ItemCard({
  item,
  collection,
  move,
  openItem,
  editTags,
  remove,
}: {
  item: Item;
  collection?: Collection;
  openItem: () => void;
} & ItemActions) {
  if (item.tweet)
    return (
      <TweetCard
        item={item}
        collection={collection}
        open={openItem}
        move={move}
        editTags={editTags}
        remove={remove}
      />
    );
  return (
    <article
      className={`item-card kind-${item.kind}`}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("a, button")) openItem();
      }}
    >
      <button
        className="item-preview"
        onClick={openItem}
        aria-label={`Open ${item.title}`}
      >
        {item.kind === "image" ? (
          <img src={`/api/files/${item.id}`} alt={item.title} loading="lazy" />
        ) : (
          <div className="preview-content">
            <span className="preview-icon">{iconFor(item.kind, 28)}</span>
            {item.kind === "link" ? (
              <span className="preview-domain">
                {new URL(item.url!).hostname}
              </span>
            ) : (
              <span className="file-extension">
                {item.filename?.split(".").pop()?.slice(0, 12).toUpperCase() ||
                  "FILE"}
              </span>
            )}
            <small>
              {item.kind === "link" ? "SAVED LINK" : bytes(item.size)}
            </small>
          </div>
        )}
        <span className="preview-open">
          <Maximize2 size={17} />
        </span>
      </button>
      <div className="item-info">
        <div className="item-title-row">
          {iconFor(item.kind, 14)}
          <button className="item-title" onClick={openItem}>
            {item.title}
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

function SheetShell({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  // Parent selection state clears on close; retain the last view through Base UI's exit.
  const [retained, setRetained] = useState({ title, description, children });
  useEffect(() => {
    if (open) setRetained({ title, description, children });
  }, [open, title, description, children]);
  const content = open ? { title, description, children } : retained;
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{content.title}</SheetTitle>
          {content.description && (
            <SheetDescription>{content.description}</SheetDescription>
          )}
        </SheetHeader>
        <div className="sheet-body">{content.children}</div>
      </SheetContent>
    </Sheet>
  );
}

async function send(
  path: string,
  body: FormData | Record<string, unknown>,
  method = "POST",
) {
  const response = await fetch(path, {
    method,
    headers:
      body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const result = (await response.json()) as {
    error?: string;
    collection?: { id: string };
    cleanup_pending?: boolean;
  };
  if (!response.ok)
    throw new Error(result.error || "Something went wrong. Try again.");
  return result;
}

function CreateCollection({ onSave }: { onSave: (id: string) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await send("/api/collections", Object.fromEntries(form));
      onSave(result.collection!.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="dialog-form" onSubmit={submit}>
      <label>
        Collection name
        <input
          name="name"
          required
          maxLength={80}
          placeholder="Collection name"
          autoComplete="off"
        />
      </label>
      <label>
        Description <span className="optional">optional</span>
        <textarea
          name="description"
          maxLength={240}
          rows={2}
          placeholder="Description"
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button disabled={busy} className="button primary form-submit">
        {busy ? "Creating…" : "Create collection"}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}

function CollectionSelect({
  collections,
  selected,
}: {
  collections: Collection[];
  selected: string;
}) {
  return (
    <label>
      Save to
      <select name="collection_id" defaultValue={selected}>
        {collections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.id === "inbox" ? " (default)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function SaveItem({
  collections,
  selected,
  onSave,
}: {
  collections: Collection[];
  selected: string;
  onSave: () => void;
}) {
  const [mode, setMode] = useState<"link" | "file">("link");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (file instanceof File && file.size > MAX_FILE_SIZE) {
      setError("Choose a file that is 10 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      await send(
        "/api/items",
        mode === "file" ? form : Object.fromEntries(form),
      );
      onSave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="save-tabs" role="group" aria-label="Save type">
        <button
          className={mode === "link" ? "active" : ""}
          aria-pressed={mode === "link"}
          disabled={busy}
          onClick={() => {
            setMode("link");
            setError("");
          }}
        >
          <Link2 size={16} />
          Link
        </button>
        <button
          className={mode === "file" ? "active" : ""}
          aria-pressed={mode === "file"}
          disabled={busy}
          onClick={() => {
            setMode("file");
            setFilename("");
            setError("");
          }}
        >
          <Upload size={16} />
          Image or file
        </button>
      </div>
      <form className="dialog-form" onSubmit={submit}>
        {mode === "link" ? (
          <label>
            URL
            <input
              name="url"
              type="url"
              required
              maxLength={4096}
              placeholder="https://example.com"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>
        ) : (
          <label className="upload-field">
            <Upload size={24} />
            <strong>{filename || "Choose an image or file"}</strong>
            <span>Any file, up to 10 MB</span>
            <input
              name="file"
              type="file"
              required
              onChange={(e) => setFilename(e.target.files?.[0]?.name || "")}
            />
          </label>
        )}
        <label>
          Title <span className="optional">optional</span>
          <input name="title" maxLength={200} placeholder="Title" />
        </label>
        <label>
          Tags <span className="optional">optional</span>
          <input name="tags" maxLength={1024} placeholder="design, reading" />
          <span className="field-hint">
            Separate tags with commas. Up to 10 tags.
          </span>
        </label>
        <CollectionSelect collections={collections} selected={selected} />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy} className="button primary form-submit">
          {busy ? "Saving…" : "Save to vault"}
          <Plus size={16} />
        </button>
      </form>
    </>
  );
}

function MoveItem({
  item,
  collections,
  onSave,
}: {
  item: Item;
  collections: Collection[];
  onSave: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send(
        `/api/items/${item.id}`,
        Object.fromEntries(new FormData(event.currentTarget)),
        "PATCH",
      );
      onSave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="dialog-form" onSubmit={submit}>
      <CollectionSelect
        collections={collections}
        selected={item.collection_id}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary form-submit" disabled={busy}>
        {busy ? "Moving…" : "Move item"}
        <MoveRight size={16} />
      </button>
    </form>
  );
}

function PhoneHelp() {
  return (
    <div className="phone-help">
      <p>
        Send a <code>POST</code> request to <code>/api/capture</code> on your
        Vault’s address, with JSON or form data:
      </p>
      <pre>
        {'{\n  "url": "https://example.com",\n  "title": "Example link"\n}'}
      </pre>
      <p>
        Only <code>url</code> is required. Links land in Inbox so you can sort
        them later.
      </p>
      <div className="help-note">
        <Inbox size={19} />
        <span>
          This endpoint is open without a token. It accepts links only, limited
          to 30 requests per minute per IP at each Cloudflare location.
        </span>
      </div>
    </div>
  );
}

function EditTags({ item, onSave }: { item: Item; onSave: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await send(`/api/items/${item.id}`, { tags: form.get("tags") }, "PATCH");
      onSave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="dialog-form" onSubmit={submit}>
      <label>
        Tags
        <input
          name="tags"
          maxLength={1024}
          defaultValue={(item.tags || []).join(", ")}
          placeholder="design, reading"
        />
        <span className="field-hint">
          Separate tags with commas. Leave empty to remove all tags.
        </span>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary form-submit" disabled={busy}>
        {busy ? "Saving…" : "Save tags"}
      </button>
    </form>
  );
}

function DeleteItem({
  item,
  cancel,
  onDelete,
}: {
  item: Item;
  cancel: () => void;
  onDelete: (pending: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      const result = await send(`/api/items/${item.id}`, {}, "DELETE");
      onDelete(!!result.cleanup_pending);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="delete-confirm">
      <p className="delete-item-title">{item.title}</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="delete-actions">
        <button className="button secondary" disabled={busy} onClick={cancel}>
          Cancel
        </button>
        <button className="button primary" disabled={busy} onClick={remove}>
          {busy ? "Deleting…" : "Delete item"}
        </button>
      </div>
    </div>
  );
}
