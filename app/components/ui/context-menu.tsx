// Touch and pointer context menu built from Kumo's ContextMenu primitives.
import { ContextMenu as Primitive } from "@cloudflare/kumo/primitives/context-menu";
import type { ReactNode, ComponentProps } from "react";
export const ContextMenu = Primitive.Root;
export const ContextMenuTrigger = Primitive.Trigger;
export function ContextMenuContent({ children }: { children: ReactNode }) {
  return (
    <Primitive.Portal>
      <Primitive.Positioner className="context-positioner" sideOffset={4}>
        <Primitive.Popup className="context-menu">{children}</Primitive.Popup>
      </Primitive.Positioner>
    </Primitive.Portal>
  );
}
export function ContextMenuItem({
  destructive,
  ...props
}: ComponentProps<typeof Primitive.Item> & { destructive?: boolean }) {
  return (
    <Primitive.Item
      className={`context-menu-item ${destructive ? "is-destructive" : ""}`}
      {...props}
    />
  );
}
export function ContextMenuSeparator() {
  return <Primitive.Separator className="context-separator" />;
}
