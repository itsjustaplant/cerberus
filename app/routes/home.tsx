import { Input } from "../components/ui/input";
import { TagField } from "../components/tag-field";
import { Checkbox } from "@cloudflare/kumo/components/checkbox";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Field } from "@cloudflare/kumo/components/field";
import { Textarea } from "@cloudflare/kumo/components/input";
import { Button } from "../components/ui/button";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { Dialog as NavigationDialog } from "@cloudflare/kumo/primitives/dialog";
import { Breadcrumbs } from "@cloudflare/kumo/components/breadcrumbs";
import { Tooltip } from "@cloudflare/kumo/components/tooltip";
import { LinkProvider, type LinkComponentProps } from "@cloudflare/kumo";
import {
  ActionContextMenu,
  type ContextAction,
} from "../components/action-context-menu";
import {
  useEffect,
  useState,
  forwardRef,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowsOutIcon as Maximize2,
  DotsThreeIcon as MoreHorizontal,
  PencilSimpleIcon as Pencil,
  TrashIcon as Trash2,
  ArrowRightIcon,
  ArrowSquareOutIcon,
  ArrowUpRightIcon,
  CheckSquareIcon,
  FileIcon,
  FolderIcon as Folder,
  FolderOpenIcon,
  FolderPlusIcon as FolderPlus,
  SquaresFourIcon as Grid2X2,
  TrayIcon as Inbox,
  LinkIcon as Link2,
  PlusIcon as Plus,
  TagIcon,
  MagnifyingGlassIcon as Search,
  UploadSimpleIcon as Upload,
  XIcon as X,
  ImageIcon,
} from "@phosphor-icons/react";
import {
  Form,
  Link,
  redirect,
  useNavigate,
  useRevalidator,
  type LoaderFunctionArgs,
} from "react-router";
import { Select } from "@cloudflare/kumo/components/select";
import { useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { collectionPath, itemPath } from "../lib/library-url";
import { CerberusMark } from "../components/cerberus-mark";
import { useStorageUsage } from "../components/use-storage-usage";
import { StorageMeter } from "../components/storage-meter";
import { ThemeSwitcher } from "../components/theme-switcher";
import { LibrarySidebar } from "../components/library-sidebar";
import { getStorageUsage } from "../lib/storage.server";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  useSheetPortal,
} from "../components/ui/sheet";
import { ItemDetail } from "../components/item-detail";
import { ItemFooter, ItemHeaderActions } from "../components/item-footer";
import { TweetCard, TweetArchiveView } from "../components/tweet-archive";
import type { Route } from "./+types/home";
import { cloudflareContext } from "../lib/cloudflare.server";
import {
  collectionExists,
  getItem,
  InputError,
  listCollections,
  listItems,
} from "../lib/vault.server";
import { listTags, parseTags } from "../lib/tags.server";
import type { Collection, Item } from "../lib/models";
import { MAX_FILE_SIZE } from "../lib/models";

const TOAST_TIMEOUT = 4500;

const BreadcrumbRouterLink = forwardRef<HTMLAnchorElement, LinkComponentProps>(
  ({ href, to, ...props }, ref) => (
    <Link ref={ref} to={href ?? to ?? "/"} {...props} />
  ),
);

export function meta() {
  return [
    { title: "Cerberus" },
    {
      name: "description",
      content: "Links, images, and files.",
    },
  ];
}

export async function loader({
  request,
  context,
  params: routeParams,
}: LoaderFunctionArgs) {
  const { env } = context.get(cloudflareContext);
  const url = new URL(request.url);
  const params = url.searchParams;
  if (params.has("collection") || params.has("view")) {
    const legacyCollection = params.get("collection");
    const path = legacyCollection
      ? collectionPath(legacyCollection)
      : params.get("view") === "collections"
        ? "/collections"
        : "/";
    params.delete("collection");
    params.delete("view");
    throw redirect(path + (params.size ? `?${params}` : ""));
  }
  const collection = routeParams.collectionId || null;
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
  const [collections, results, tags, storage, focusedItem] = await Promise.all([
    listCollections(env),
    listItems(env, collection, query, kind, page, selectedTags),
    listTags(env, collection),
    getStorageUsage(env),
    collection && routeParams.itemId
      ? getItem(env, collection, routeParams.itemId)
      : null,
  ]);
  if (routeParams.itemId && !focusedItem)
    throw new Response("Item not found", { status: 404 });
  return {
    collections,
    storage,
    tags,
    selectedTags,
    items: results.slice(0, 48),
    focusedItem,
    page,
    hasMore: results.length > 48,
    collection,
    query,
    kind,
    view: "items",
  };
}

function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <CerberusMark />
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

type Modal = "collection" | "save" | null;
type ItemDestination = Pick<Item, "id" | "collection_id">;

export default function Home({ loaderData: data }: Route.ComponentProps) {
  const storage = useStorageUsage(data.storage);
  const toastManager = useKumoToastManager();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  useEffect(() => {
    const desktop = matchMedia("(min-width: 701px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileMenuOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const [modal, setModal] = useState<Modal>(null);
  const [moving, setMoving] = useState<Item | null>(null);
  const [tagging, setTagging] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [collectionAction, setCollectionAction] = useState<{
    collection: Collection;
    mode: "manage" | "rename" | "delete";
  } | null>(null);
  const [renamingItem, setRenamingItem] = useState<Item | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<
    "move" | "tags" | "delete" | null
  >(null);
  const visibleSelected = data.items.filter((item) =>
    selectedIds.includes(item.id),
  );
  const allVisibleSelected =
    data.items.length > 0 &&
    data.items.every((item) => selectedIds.includes(item.id));
  const selectionKey = [
    data.view,
    data.collection,
    data.query,
    data.kind,
    data.page,
    ...data.selectedTags,
  ].join("|");
  useEffect(() => {
    setSelectedIds([]);
    setBulkAction(null);
  }, [selectionKey]);
  function toggleItem(id: string) {
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    );
  }
  function collectionMenu(collection: Collection): ContextAction[] {
    return [
      {
        label: "Open collection",
        group: "navigation",
        icon: <FolderOpenIcon size={16} />,
        onClick: () => {
          void navigate(collectionPath(collection.id));
        },
      },
      {
        label: "Rename collection",
        group: "manage",
        icon: <Pencil size={16} />,
        onClick: () => setCollectionAction({ collection, mode: "rename" }),
        disabled: collection.id === "inbox",
      },
      {
        label: "Delete collection",
        group: "manage",
        icon: <Trash2 size={16} />,
        onClick: () => setCollectionAction({ collection, mode: "delete" }),
        destructive: true,
        disabled: collection.id === "inbox",
      },
    ];
  }
  function itemMenu(item: Item): ContextAction[] {
    const bulk = selectedIds.includes(item.id) && visibleSelected.length > 1;
    return [
      {
        label: "Open item",
        group: "item",
        icon: <ArrowSquareOutIcon size={16} />,
        onClick: () => setActiveItemId(item.id),
      },
      {
        label: selectedIds.includes(item.id) ? "Deselect item" : "Select item",
        group: "item",
        icon: <CheckSquareIcon size={16} />,
        onClick: () => {
          toggleItem(item.id);
        },
      },
      ...(bulk
        ? [
            {
              label: `Move ${visibleSelected.length} selected items`,
              group: "selection",
              icon: <ArrowRightIcon size={16} />,
              onClick: () => setBulkAction("move"),
            },
            {
              label: "Add tags to selection",
              group: "selection",
              icon: <TagIcon size={16} />,
              onClick: () => setBulkAction("tags"),
            },
            {
              label: `Delete ${visibleSelected.length} selected items`,
              group: "selection",
              icon: <Trash2 size={16} />,
              onClick: () => setBulkAction("delete"),
              destructive: true,
            },
          ]
        : [
            {
              label: "Rename item",
              group: "manage",
              icon: <Pencil size={16} />,
              onClick: () => setRenamingItem(item),
            },
            {
              label: "Edit tags",
              group: "manage",
              icon: <TagIcon size={16} />,
              onClick: () => setTagging(item),
            },
            {
              label: "Move item",
              group: "manage",
              icon: <ArrowRightIcon size={16} />,
              onClick: () => setMoving(item),
            },
            {
              label: "Delete item",
              group: "manage",
              icon: <Trash2 size={16} />,
              onClick: () => setDeleting(item),
              destructive: true,
            },
          ]),
    ];
  }
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const activeItem =
    data.focusedItem || data.items.find((item) => item.id === activeItemId);
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const hasPendingArchives =
    !data.storage.ready ||
    [...data.items, ...(data.focusedItem ? [data.focusedItem] : [])].some(
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
  const collectionsView = data.view === "collections";
  const title = collectionsView ? "Collections" : selected?.name || "All items";
  const description =
    !collectionsView && selected?.id !== "inbox" ? selected?.description : "";
  function saved(message: string, item?: ItemDestination) {
    if (item) {
      let toastId = "";
      toastId = toastManager.add({
        title: message,
        variant: "success",
        timeout: TOAST_TIMEOUT,
        actions: [
          {
            children: "View item",
            variant: "primary",
            className: "cerberus-toast-action",
            onClick: () => {
              void navigate(itemPath(item.collection_id, item.id));
              toastManager.close(toastId);
            },
          },
        ],
      });
    } else {
      toastManager.add({
        title: message,
        variant: "success",
        timeout: TOAST_TIMEOUT,
      });
    }
    setModal(null);
    setMoving(null);
    if (
      data.focusedItem &&
      (!item || item.collection_id !== data.focusedItem.collection_id)
    ) {
      setActiveItemId(null);
      void navigate(
        collectionPath(item?.collection_id || data.focusedItem.collection_id),
        { replace: true },
      );
    } else {
      void revalidator.revalidate();
    }
  }
  const libraryPath = data.collection ? collectionPath(data.collection) : "/";
  function filterUrl(
    kind: string,
    tags = data.selectedTags,
    page = 1,
    query = data.query,
  ) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (kind) params.set("kind", kind);
    for (const tag of tags) params.append("tag", tag);
    if (page > 1) params.set("page", String(page));
    return libraryPath + (params.size ? `?${params}` : "");
  }
  return (
    <NavigationDialog.Root
      open={mobileMenuOpen}
      onOpenChange={setMobileMenuOpen}
    >
      <div className="app-shell" data-sidebar-open={desktopSidebarOpen}>
        <header className="mobile-app-header">
          <NavigationDialog.Trigger
            render={
              <Button
                className="mobile-menu-button"
                aria-label="Open menu"
                title="Open menu"
              >
                <Mark />
              </Button>
            }
          />
          <Link to="/" className="mobile-app-brand">
            Cerberus
          </Link>
        </header>
        <div className="theme-menu-cell">
          <ThemeSwitcher />
        </div>
        <nav className="workspace-rail" aria-label="Workspace">
          <Link
            to="/"
            className="rail-home"
            aria-label="Cerberus home"
            title="Cerberus home"
          >
            <Mark />
          </Link>
          <span className="rail-divider" />
          <Link
            to="/"
            className={`rail-button ${!collectionsView ? "active" : ""}`}
            aria-label="Library"
            title="Library"
            aria-current={!collectionsView ? "page" : undefined}
          >
            <Grid2X2 size={20} />
          </Link>
          <Link
            to="/collections"
            className={`rail-button ${collectionsView ? "active" : ""}`}
            aria-label="Collections"
            title="Collections"
            aria-current={collectionsView ? "page" : undefined}
          >
            <Folder size={20} />
          </Link>
        </nav>
        <Link to="/" className="desktop-sidebar-title">
          Cerberus
        </Link>
        <LibrarySidebar
          desktopOpen={desktopSidebarOpen}
          onDesktopToggle={() => setDesktopSidebarOpen((open) => !open)}
          collections={data.collections}
          collection={data.collection}
          collectionsView={collectionsView}
          collectionMenu={collectionMenu}
          onMobileClose={() => setMobileMenuOpen(false)}
          onCreateCollection={() => setModal("collection")}
        />
        <div className="main-shell">
          <header className="topbar">
            <LinkProvider component={BreadcrumbRouterLink}>
              <Breadcrumbs className="breadcrumb" aria-label="Library location">
                <Breadcrumbs.Link href="/">Library</Breadcrumbs.Link>
                <Breadcrumbs.Separator />
                <Breadcrumbs.Current>{title}</Breadcrumbs.Current>
              </Breadcrumbs>
            </LinkProvider>
            <div className="topbar-actions">
              <div className="header-cell">
                <StorageMeter usage={storage} />
              </div>
              <div className="header-cell">
                <Button
                  className="button primary header-save"
                  aria-label="Save item"
                  title="Save item"
                  onClick={() => setModal("save")}
                >
                  <Plus size={18} />
                  <span className="header-save-label">Save item</span>
                </Button>
              </div>
            </div>
          </header>
          <main className="main-content" data-page-content>
            <div className="page-heading">
              <div>
                <h1>
                  {title}
                  <span className="heading-dot">.</span>
                </h1>
                {description && (
                  <p className="page-description">{description}</p>
                )}
                {selected && (
                  <Button
                    className="text-link manage-collection"
                    onClick={() =>
                      setCollectionAction({
                        collection: selected,
                        mode: "manage",
                      })
                    }
                  >
                    Manage collection
                  </Button>
                )}
              </div>
              {collectionsView ? (
                <Button
                  className="button secondary"
                  onClick={() => setModal("collection")}
                >
                  <FolderPlus size={16} />
                  New collection
                </Button>
              ) : (
                <span className="item-total">
                  {plural(selected?.count ?? total)}
                </span>
              )}
            </div>
            {collectionsView ? (
              <div className="collections-grid">
                {data.collections.map((c, i) => (
                  <CollectionCard
                    key={c.id}
                    collection={c}
                    tone={i % 4}
                    actions={collectionMenu(c)}
                    manage={() =>
                      setCollectionAction({ collection: c, mode: "manage" })
                    }
                  />
                ))}
                <Button
                  className="collection-card create-card"
                  onClick={() => setModal("collection")}
                >
                  <Plus size={24} />
                  <span>New collection</span>
                </Button>
              </div>
            ) : (
              <>
                {!data.collection && (
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
                      <Link to="/collections" className="text-link">
                        View all
                        <ArrowRightIcon size={14} />
                      </Link>
                    </div>
                    <div className="collection-strip">
                      {data.collections.slice(0, 3).map((c, i) => (
                        <CollectionCard
                          key={c.id}
                          collection={c}
                          tone={i % 4}
                          actions={collectionMenu(c)}
                          manage={() =>
                            setCollectionAction({
                              collection: c,
                              mode: "manage",
                            })
                          }
                        />
                      ))}
                      <Button
                        className="collection-card create-card"
                        onClick={() => setModal("collection")}
                      >
                        <Plus size={22} />
                        <span>New collection</span>
                      </Button>
                    </div>
                  </section>
                )}
                <section className="items-section" aria-label="Saved items">
                  <div className="section-heading">
                    <h2>
                      {data.collection ? "In this collection" : "Saved items"}
                      <span>Newest first</span>
                    </h2>
                    <Button
                      className="select-all-button"
                      aria-pressed={allVisibleSelected}
                      disabled={!data.items.length}
                      onClick={() =>
                        setSelectedIds(
                          allVisibleSelected
                            ? []
                            : data.items.map((item) => item.id),
                        )
                      }
                    >
                      {allVisibleSelected ? "Deselect all" : "Select all"}
                    </Button>
                  </div>
                  <div className="library-toolbar">
                    <nav aria-label="Item types">
                      <Tabs
                        value={data.kind || "all"}
                        variant="segmented"
                        size="sm"
                        className="filter-tabs"
                        listClassName="filter-tabs-list"
                        tabs={[
                          ["all", "", "Everything"],
                          ["link", "link", "Links"],
                          ["image", "image", "Images"],
                          ["file", "file", "Files"],
                        ].map(([value, kind, label]) => ({
                          value,
                          label,
                          nativeButton: false,
                          render: (props) => (
                            <Link
                              {...props}
                              to={filterUrl(kind)}
                              aria-current={
                                data.kind === kind ? "page" : undefined
                              }
                            >
                              {label}
                            </Link>
                          ),
                        }))}
                      />
                    </nav>
                    <Form
                      method="get"
                      action={libraryPath}
                      className="search-form"
                      key={`${data.collection}-${data.query}`}
                      role="search"
                    >
                      {data.kind && (
                        <Input type="hidden" name="kind" value={data.kind} />
                      )}
                      {data.selectedTags.map((tag) => (
                        <Input key={tag} type="hidden" name="tag" value={tag} />
                      ))}
                      <Search size={16} />
                      <Input
                        aria-label="Search your library"
                        name="q"
                        defaultValue={data.query}
                        placeholder="Search your library…"
                        maxLength={200}
                      />
                      <Button className="sr-only" type="submit">
                        Search
                      </Button>
                      {data.query && (
                        <Tooltip
                          content="Clear search"
                          render={
                            <Link
                              className="icon-button"
                              to={filterUrl(
                                data.kind,
                                data.selectedTags,
                                1,
                                "",
                              )}
                              aria-label="Clear search"
                            >
                              <X size={14} />
                            </Link>
                          }
                        />
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
                              data.selectedTags.includes(tag)
                                ? "page"
                                : undefined
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
                        <ActionContextMenu
                          key={item.id}
                          className={`item-card-shell ${selectedIds.includes(item.id) ? "is-selected" : ""}`}
                          label={`Actions for ${item.title}`}
                          actions={itemMenu(item)}
                        >
                          <label className="item-selection">
                            <Checkbox
                              checked={selectedIds.includes(item.id)}
                              onCheckedChange={() => toggleItem(item.id)}
                              aria-label={`Select ${item.title}`}
                            />
                          </label>
                          <ItemCard
                            item={item}
                            collection={data.collections.find(
                              (c) => c.id === item.collection_id,
                            )}
                            openItem={() => setActiveItemId(item.id)}
                          />
                        </ActionContextMenu>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-art">
                        <span>
                          <Link2 size={22} />
                        </span>
                        <span>
                          <Inbox size={32} weight="regular" />
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
                        <Link className="button secondary" to={libraryPath}>
                          Clear filters
                        </Link>
                      ) : (
                        <p>Use Save to add your first link, image, or file.</p>
                      )}
                    </div>
                  )}
                  {(data.hasMore || data.page > 1) && (
                    <nav className="pagination" aria-label="Library pages">
                      {data.page > 1 ? (
                        <Link
                          className="button secondary"
                          to={filterUrl(
                            data.kind,
                            data.selectedTags,
                            data.page - 1,
                          )}
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
                          to={filterUrl(
                            data.kind,
                            data.selectedTags,
                            data.page + 1,
                          )}
                        >
                          Next <ArrowRightIcon size={14} />
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

        <SheetShell
          open={!!collectionAction}
          onClose={() => setCollectionAction(null)}
          title={
            collectionAction?.mode === "delete"
              ? "Delete collection?"
              : collectionAction?.mode === "rename"
                ? "Rename collection"
                : "Manage collection"
          }
          description={collectionAction?.collection.name}
        >
          {collectionAction && (
            <CollectionManagement
              key={`${collectionAction.collection.id}-${collectionAction.mode}`}
              collection={collectionAction.collection}
              collections={data.collections}
              mode={collectionAction.mode}
              changeMode={(mode) =>
                setCollectionAction({ ...collectionAction, mode })
              }
              onSave={(destination, deleted) => {
                const removed = collectionAction.collection.id;
                setCollectionAction(null);
                if (deleted && data.collection === removed) {
                  setActiveItemId(null);
                  void navigate(
                    destination ? collectionPath(destination) : "/",
                    {
                      replace: true,
                    },
                  );
                  toastManager.add({
                    title: "Collection deleted. Items preserved.",
                    variant: "success",
                    timeout: TOAST_TIMEOUT,
                  });
                } else
                  saved(
                    deleted ? "Collection deleted." : "Collection renamed.",
                  );
              }}
            />
          )}
        </SheetShell>
        <SheetShell
          open={!!renamingItem}
          onClose={() => setRenamingItem(null)}
          title="Rename item"
        >
          {renamingItem && (
            <RenameItem
              key={renamingItem.id}
              item={renamingItem}
              onSave={() => {
                setRenamingItem(null);
                saved("Item renamed.", renamingItem);
              }}
            />
          )}
        </SheetShell>
        <SheetShell
          open={!!bulkAction}
          onClose={() => setBulkAction(null)}
          title={
            bulkAction === "delete"
              ? `Delete ${visibleSelected.length} items?`
              : bulkAction === "move"
                ? "Move selected items"
                : "Add tags to selected items"
          }
          description={
            bulkAction === "delete"
              ? "This permanently deletes the selected items and their files and archives."
              : `${visibleSelected.length} items selected on this page.`
          }
        >
          {bulkAction && (
            <BulkItemForm
              action={bulkAction}
              items={visibleSelected}
              collections={data.collections}
              onSave={(succeeded, failures, cleanup) => {
                setSelectedIds((ids) =>
                  ids.filter((id) => !succeeded.includes(id)),
                );
                setBulkAction(null);
                if (failures)
                  toastManager.add({
                    title: `${failures} items could not be updated. They remain selected.`,
                    variant: "error",
                    timeout: TOAST_TIMEOUT,
                  });
                else {
                  toastManager.add({
                    title: `${succeeded.length} items updated.${cleanup ? " Storage cleanup will retry automatically." : ""}`,
                    variant: "success",
                    timeout: TOAST_TIMEOUT,
                  });
                }
                void revalidator.revalidate();
              }}
            />
          )}
        </SheetShell>
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
                saved("Tags updated.", tagging);
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
          onClose={() => {
            setActiveItemId(null);
            if (data.focusedItem)
              void navigate(collectionPath(data.focusedItem.collection_id), {
                replace: true,
              });
          }}
          title={activeItem?.tweet ? "Saved post" : activeItem?.title || "Item"}
          actions={
            activeItem && (
              <ItemHeaderActions
                item={activeItem}
                editTags={() => setTagging(activeItem)}
                move={() => setMoving(activeItem)}
                remove={() => setDeleting(activeItem)}
              />
            )
          }
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
              void navigate(collectionPath(id));
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
            onSave={(item) => saved("Item saved.", item)}
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
              onSave={(item) => saved("Item moved.", item)}
            />
          )}
        </SheetShell>
      </div>
    </NavigationDialog.Root>
  );
}

function CollectionCard({
  collection: c,
  tone,
  actions,
  manage,
}: {
  collection: Collection;
  tone: number;
  actions: ContextAction[];
  manage: () => void;
}) {
  return (
    <ActionContextMenu
      actions={actions}
      className="collection-card-wrap"
      label={`Actions for ${c.name}`}
    >
      <Link
        to={collectionPath(c.id)}
        className={`collection-card tone-${tone}`}
      >
        <div className="collection-card-top">
          <span className="folder-tile">
            {c.id === "inbox" ? (
              <Inbox size={22} weight="regular" />
            ) : (
              <Folder size={22} weight="regular" />
            )}
          </span>
          <ArrowUpRightIcon size={16} />
        </div>
        <div>
          <h3>{c.name}</h3>
          <p>
            <span className="collection-count">{c.count}</span>
            <span>{c.count === 1 ? "item" : "items"}</span>
            {c.id === "inbox" && <span className="default-label">Default</span>}
          </p>
        </div>
      </Link>
      <Button
        className="icon-button collection-menu-button"
        onClick={manage}
        aria-label={`Manage ${c.name}`}
      >
        <MoreHorizontal size={18} />
      </Button>
    </ActionContextMenu>
  );
}

function ItemCard({
  item,
  collection,
  openItem,
}: {
  item: Item;
  collection?: Collection;
  openItem: () => void;
}) {
  if (item.tweet)
    return <TweetCard item={item} collection={collection} open={openItem} />;
  return (
    <article
      className={`item-card kind-${item.kind}`}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("a, button")) openItem();
      }}
    >
      <Button
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
      </Button>
      <div className="item-info">
        <div className="item-title-row">
          {iconFor(item.kind, 14)}
          <Button className="item-title" onClick={openItem}>
            {item.title}
          </Button>
        </div>
        <ItemFooter item={item} collection={collection} />
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
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  // Parent selection state clears on close; retain the last view through Base UI's exit.
  const [retained, setRetained] = useState({
    title,
    description,
    children,
    actions,
  });
  useEffect(() => {
    if (open) setRetained({ title, description, children, actions });
  }, [open, title, description, children, actions]);
  const content = open ? { title, description, children, actions } : retained;
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
          {content.actions}
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
    item?: ItemDestination;
    cleanup_pending?: boolean;
    succeeded?: string[];
    failed?: { id: string; error: string }[];
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
      <Input
        label="Collection name"
        description="Use a short name, up to 80 characters."
        name="name"
        required
        maxLength={80}
        placeholder="Collection name"
        autoComplete="off"
      />
      <Textarea
        label="Description"
        required={false}
        description="A short description, up to 240 characters."
        name="description"
        maxLength={240}
        rows={2}
        placeholder="Description"
      />
      {error && (
        <Banner variant="error" size="sm" role="alert" description={error} />
      )}
      <Button disabled={busy} className="button primary form-submit">
        {busy ? "Creating…" : "Create collection"}
        <ArrowRightIcon size={16} />
      </Button>
    </form>
  );
}

function CollectionSelect({
  collections,
  selected,
  label = "Save to",
}: {
  collections: Collection[];
  selected: string;
  label?: string;
}) {
  const container = useSheetPortal();
  const options = collections.map((c) => ({
    value: c.id,
    label: c.name + (c.id === "inbox" ? " (default)" : ""),
  }));
  return (
    <div className="collection-select-field">
      <Select
        label={label}
        container={container}
        name="collection_id"
        defaultValue={selected || null}
        items={options}
        required
        placeholder="Choose a collection"
        className="collection-kumo-select"
        alignItemWithTrigger={false}
      >
        {options.map((option) => (
          <Select.Option key={option.value} value={option.value}>
            {option.label}
          </Select.Option>
        ))}
      </Select>
    </div>
  );
}

function SaveItem({
  collections,
  selected,
  onSave,
}: {
  collections: Collection[];
  selected: string;
  onSave: (item: ItemDestination) => void;
}) {
  const [mode, setMode] = useState<"link" | "file">("link");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState("");
  const [fileError, setFileError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (file instanceof File && file.size > MAX_FILE_SIZE) {
      setFileError("Choose a file that is 10 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const result = await send(
        "/api/items",
        mode === "file" ? form : Object.fromEntries(form),
      );
      onSave(result.item!);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="save-tabs-group" role="group" aria-label="Save type">
        <Tabs
          value={mode}
          variant="segmented"
          size="sm"
          className="save-tabs"
          listClassName="save-tabs-list"
          onValueChange={(value) => {
            if (busy) return;
            setMode(value as "link" | "file");
            setFileError("");
            if (value === "file") setFilename("");
            setError("");
          }}
          tabs={[
            {
              value: "link",
              label: (
                <>
                  <Link2 size={16} />
                  Link
                </>
              ),
            },
            {
              value: "file",
              label: (
                <>
                  <Upload size={16} />
                  Image or file
                </>
              ),
            },
          ]}
        />
      </div>
      <form className="dialog-form" onSubmit={submit}>
        {mode === "link" ? (
          <Input
            label="URL"
            description="Paste a full http:// or https:// link."
            name="url"
            type="url"
            required
            maxLength={4096}
            placeholder="https://example.com"
            autoCapitalize="none"
            autoCorrect="off"
          />
        ) : (
          <Field
            label="Image or file"
            required
            description="Choose any file, up to 10 MB."
            error={fileError ? { message: fileError, match: true } : undefined}
          >
            <label className="upload-field">
              <Upload size={24} />
              <strong>{filename || "Choose an image or file"}</strong>
              <Input
                name="file"
                type="file"
                required
                aria-label="Image or file"
                aria-invalid={!!fileError}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setFilename(file?.name || "");
                  setFileError(
                    file && file.size > MAX_FILE_SIZE
                      ? "Choose a file that is 10 MB or smaller."
                      : "",
                  );
                }}
              />
            </label>
          </Field>
        )}
        <Input
          label="Title"
          required={false}
          description="Up to 200 characters. Leave empty to use the link or filename."
          name="title"
          maxLength={200}
          placeholder="Title"
        />
        <TagField label="Tags" disabled={busy} />
        <CollectionSelect collections={collections} selected={selected} />
        {error && (
          <Banner variant="error" size="sm" role="alert" description={error} />
        )}
        <Button disabled={busy} className="button primary form-submit">
          {busy ? "Saving…" : "Save to Cerberus"}
          <Plus size={16} />
        </Button>
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
  onSave: (item: ItemDestination) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await send(`/api/items/${item.id}`, Object.fromEntries(form), "PATCH");
      onSave({ id: item.id, collection_id: String(form.get("collection_id")) });
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
        <Banner variant="error" size="sm" role="alert" description={error} />
      )}
      <Button className="button primary form-submit" disabled={busy}>
        {busy ? "Moving…" : "Move item"}
        <ArrowRightIcon size={16} />
      </Button>
    </form>
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
      <TagField
        defaultValue={item.tags || []}
        disabled={busy}
        description="Press Enter or comma to add a tag. Up to 10 tags, 32 characters each. Remove all tags to clear them."
      />
      {error && (
        <Banner variant="error" size="sm" role="alert" description={error} />
      )}
      <Button className="button primary form-submit" disabled={busy}>
        {busy ? "Saving…" : "Save tags"}
      </Button>
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
        <Banner variant="error" size="sm" role="alert" description={error} />
      )}
      <div className="delete-actions">
        <Button className="button secondary" disabled={busy} onClick={cancel}>
          Cancel
        </Button>
        <Button className="button primary" disabled={busy} onClick={remove}>
          {busy ? "Deleting…" : "Delete item"}
        </Button>
      </div>
    </div>
  );
}

function CollectionManagement({
  collection,
  collections,
  mode,
  changeMode,
  onSave,
}: {
  collection: Collection;
  collections: Collection[];
  mode: "manage" | "rename" | "delete";
  changeMode: (mode: "rename" | "delete") => void;
  onSave: (destination: string | null, deleted: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsDestination, setNeedsDestination] = useState(
    collection.count > 0,
  );
  if (mode === "manage")
    return (
      <div className="collection-management">
        <p>{plural(collection.count)}</p>
        {collection.id === "inbox" ? (
          <p>
            Inbox is your default collection and cannot be renamed or deleted.
          </p>
        ) : (
          <>
            <Button
              className="button secondary"
              onClick={() => changeMode("rename")}
            >
              <Pencil size={16} />
              Rename collection
            </Button>
            <Button
              className="button secondary"
              onClick={() => changeMode("delete")}
            >
              <Trash2 size={16} />
              Delete collection
            </Button>
          </>
        )}
      </div>
    );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await send(
        `/api/collections/${collection.id}`,
        fields,
        mode === "delete" ? "DELETE" : "PATCH",
      );
      onSave(
        typeof fields.collection_id === "string" ? fields.collection_id : null,
        mode === "delete",
      );
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      if (mode === "delete" && message.includes("destination"))
        setNeedsDestination(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="dialog-form" onSubmit={submit}>
      {mode === "rename" ? (
        <Input
          label="Collection name"
          description="Up to 80 characters."
          name="name"
          required
          maxLength={80}
          defaultValue={collection.name}
        />
      ) : (
        <>
          <p>
            {needsDestination
              ? "Move every item to another collection, then delete this collection. Files and archives will be preserved."
              : "This collection is empty. Deleting it cannot be undone."}
          </p>
          {needsDestination && (
            <CollectionSelect
              collections={collections.filter((c) => c.id !== collection.id)}
              selected=""
              label="Move items to"
            />
          )}
        </>
      )}
      {error && (
        <Banner variant="error" size="sm" role="alert" description={error} />
      )}
      <Button className="button primary form-submit" disabled={busy}>
        {busy
          ? "Saving…"
          : mode === "delete"
            ? needsDestination
              ? "Move items and delete collection"
              : "Delete collection"
            : "Save name"}
      </Button>
    </form>
  );
}
function RenameItem({ item, onSave }: { item: Item; onSave: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
      <Input
        label="Item name"
        description="Up to 200 characters."
        name="title"
        maxLength={200}
        required
        defaultValue={item.title}
      />
      {error && (
        <Banner variant="error" size="sm" role="alert" description={error} />
      )}
      <Button className="button primary form-submit" disabled={busy}>
        {busy ? "Saving…" : "Save name"}
      </Button>
    </form>
  );
}
function BulkItemForm({
  action,
  items,
  collections,
  onSave,
}: {
  action: "move" | "tags" | "delete";
  items: Item[];
  collections: Collection[];
  onSave: (succeeded: string[], failures: number, cleanup: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await send("/api/items/bulk", {
        ...Object.fromEntries(new FormData(event.currentTarget)),
        action,
        ids: items.map((item) => item.id),
      });
      onSave(
        result.succeeded || [],
        result.failed?.length || 0,
        !!result.cleanup_pending,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="dialog-form" onSubmit={submit}>
      {action === "move" && (
        <CollectionSelect
          collections={collections}
          selected=""
          label="Move selected items to"
        />
      )}
      {action === "tags" && (
        <TagField
          label="Tags to add"
          required
          disabled={busy}
          description="Press Enter or comma to add a tag. Adds these tags to every selected item. Existing tags are kept."
        />
      )}
      {action === "delete" && (
        <p>
          {items.length} selected items will be permanently deleted. This cannot
          be undone.
        </p>
      )}
      {error && (
        <Banner variant="error" size="sm" role="alert" description={error} />
      )}
      <Button
        className="button primary form-submit"
        disabled={busy || !items.length}
      >
        {busy
          ? "Working…"
          : action === "delete"
            ? `Delete ${items.length} items`
            : action === "move"
              ? `Move ${items.length} items`
              : "Add tags"}
      </Button>
    </form>
  );
}
