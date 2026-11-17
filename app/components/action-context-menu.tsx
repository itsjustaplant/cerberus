import type { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "./ui/context-menu";
export interface ContextAction {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}
export function ActionContextMenu({
  actions,
  children,
  className = "",
  label,
}: {
  actions: ContextAction[];
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger className={className} tabIndex={0} aria-label={label}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {actions.map((action) => (
          <ContextMenuItem
            key={action.label}
            onClick={action.onClick}
            destructive={action.destructive}
            disabled={action.disabled}
          >
            {action.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
