import { Fragment, type ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "./ui/context-menu";
export interface ContextAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  group: string;
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
        {actions.map((action, index) => (
          <Fragment key={action.label}>
            {index > 0 && action.group !== actions[index - 1].group && (
              <ContextMenuSeparator />
            )}
            <ContextMenuItem
              onClick={action.onClick}
              destructive={action.destructive}
              disabled={action.disabled}
            >
              {action.icon && (
                <span className="context-menu-item-icon" aria-hidden="true">
                  {action.icon}
                </span>
              )}
              <span>{action.label}</span>
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
