import { useState, type CSSProperties } from "react";
import { useLinkClickHandler } from "react-router";
import { Sidebar } from "@cloudflare/kumo/components/sidebar";
import { MagnifyingGlassIcon, PlusIcon } from "@phosphor-icons/react";
import { ActionContextMenu, type ContextAction } from "./action-context-menu";
import { CerberusMark } from "./cerberus-mark";
import { Dialog } from "@cloudflare/kumo/primitives/dialog";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { collectionPath } from "../lib/library-url";
import type { Collection } from "../lib/models";

function NavigationItem({
  to,
  active,
  label,
  count,
}: {
  to: string;
  active: boolean;
  label: string;
  count: number;
}) {
  const handleClick = useLinkClickHandler<HTMLButtonElement>(to);
  return (
    <Sidebar.MenuButton
      size="base"
      href={to}
      active={active}
      tooltip={label}
      aria-label={label}
      onClick={handleClick}
      aria-current={active ? "page" : undefined}
    >
      <span className="truncate flex-1">{label}</span>
      <Sidebar.MenuBadge>{count}</Sidebar.MenuBadge>
    </Sidebar.MenuButton>
  );
}

export function LibrarySidebar({
  collections,
  collection,
  collectionsView,
  collectionMenu,
  onCreateCollection,
  onMobileClose,
  desktopOpen,
  onDesktopToggle,
}: {
  collections: Collection[];
  collection: string | null;
  collectionsView: boolean;
  collectionMenu: (collection: Collection) => ContextAction[];
  onCreateCollection: () => void;
  onMobileClose: () => void;
  desktopOpen: boolean;
  onDesktopToggle: () => void;
}) {
  const [query, setQuery] = useState("");
  const filteredCollections = collections.filter(
    (entry) =>
      entry.id !== "inbox" &&
      entry.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  function navigation() {
    return (
      <Sidebar.Content>
        <div className="sidebar-search">
          <MagnifyingGlassIcon size={16} aria-hidden="true" />
          <Input
            aria-label="Find a collection"
            placeholder="Search collections…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Sidebar.Group>
          <Sidebar.Menu>
            <NavigationItem
              to="/"
              active={!collection && !collectionsView}
              label="All items"
              count={collections.reduce(
                (total, entry) => total + entry.count,
                0,
              )}
            />
            <NavigationItem
              to="/collections/inbox"
              active={collection === "inbox"}
              label="Inbox"
              count={
                collections.find((entry) => entry.id === "inbox")?.count || 0
              }
            />
            <NavigationItem
              to="/collections"
              active={collectionsView}
              label="Collections"
              count={collections.length}
            />
          </Sidebar.Menu>
        </Sidebar.Group>
        <Sidebar.Separator />
        <Sidebar.Group>
          <Sidebar.Menu>
            <Sidebar.MenuItem>
              <Sidebar.Collapsible defaultOpen>
                <Sidebar.CollapsibleTrigger
                  render={
                    <Sidebar.MenuButton className="sidebar-section-trigger">
                      Collections
                      <Sidebar.MenuChevron />
                    </Sidebar.MenuButton>
                  }
                />
                <Sidebar.CollapsibleContent>
                  <Sidebar.Menu>
                    {filteredCollections.map((entry) => (
                      <Sidebar.MenuItem key={entry.id}>
                        <ActionContextMenu
                          label={`Collection ${entry.name}`}
                          actions={collectionMenu(entry).map((action) => ({
                            ...action,
                            onClick: () => {
                              onMobileClose();
                              action.onClick();
                            },
                          }))}
                        >
                          <NavigationItem
                            to={collectionPath(entry.id)}
                            active={collection === entry.id}
                            label={entry.name}
                            count={entry.count}
                          />
                        </ActionContextMenu>
                      </Sidebar.MenuItem>
                    ))}
                    {query.trim() && filteredCollections.length === 0 && (
                      <li className="sidebar-no-results">
                        No collections found.
                      </li>
                    )}
                    <Sidebar.MenuItem>
                      <Sidebar.MenuButton
                        size="base"
                        tooltip="New collection"
                        aria-label="New collection"
                        icon={<PlusIcon size={16} />}
                        onClick={() => {
                          onMobileClose();
                          onCreateCollection();
                        }}
                      >
                        New collection
                      </Sidebar.MenuButton>
                    </Sidebar.MenuItem>
                  </Sidebar.Menu>
                </Sidebar.CollapsibleContent>
              </Sidebar.Collapsible>
            </Sidebar.MenuItem>
          </Sidebar.Menu>
        </Sidebar.Group>
      </Sidebar.Content>
    );
  }
  return (
    <Sidebar.Provider
      collapsible="none"
      open
      mobileBreakpoint={700}
      className="library-sidebar-provider"
      style={
        {
          "--sidebar-width":
            "calc(var(--cerberus-sidebar-width) - var(--workspace-rail-size))",
        } as CSSProperties
      }
    >
      <div className="sidebar-logo-rail">
        <Button
          variant="ghost"
          className="sidebar-logo-toggle"
          onClick={onDesktopToggle}
          aria-label={desktopOpen ? "Collapse sidebar" : "Open sidebar"}
          aria-expanded={desktopOpen}
          aria-controls="desktop-library-sidebar"
        >
          <CerberusMark />
        </Button>
      </div>
      <Sidebar
        id="desktop-library-sidebar"
        className="library-sidebar desktop-library-sidebar"
        data-open={desktopOpen}
        inert={!desktopOpen}
        aria-label="Library sidebar"
      >
        <Sidebar.Header />
        {navigation()}
      </Sidebar>
      <Dialog.Portal keepMounted>
        <Dialog.Backdrop className="mobile-sidebar-backdrop" />
        <Dialog.Popup
          className="library-sidebar mobile-sidebar-popup"
          aria-describedby={undefined}
          onClick={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest("a[href]") &&
              event.button === 0 &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey &&
              !event.altKey
            )
              onMobileClose();
          }}
        >
          <Sidebar.Header>
            <Dialog.Close
              render={
                <Button
                  variant="ghost"
                  className="mobile-drawer-logo-button"
                  aria-label="Close menu"
                >
                  <CerberusMark />
                </Button>
              }
            />
            <Dialog.Title className="mobile-drawer-title">
              Cerberus
            </Dialog.Title>
          </Sidebar.Header>
          {navigation()}
        </Dialog.Popup>
      </Dialog.Portal>
    </Sidebar.Provider>
  );
}
