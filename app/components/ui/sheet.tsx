// Cerberus side sheet built from Kumo's accessible Dialog primitives.
import {
  createContext,
  useContext,
  useState,
  type ComponentProps,
} from "react";
import { Dialog as SheetPrimitive } from "@cloudflare/kumo/primitives/dialog";
import { XIcon as X } from "@phosphor-icons/react";
import { Tooltip } from "@cloudflare/kumo/components/tooltip";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
const SheetPortalContext = createContext<HTMLElement | null>(null);
export function useSheetPortal() {
  return useContext(SheetPortalContext);
}

export function SheetContent({
  className = "",
  children,
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & { showCloseButton?: boolean }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop
        data-slot="sheet-overlay"
        className="sheet-overlay"
      />
      <SheetPrimitive.Popup
        ref={setContainer}
        data-slot="sheet-content"
        data-side="right"
        className={`sheet-content ${className}`}
        {...props}
      >
        <SheetPortalContext.Provider value={container}>
          {children}
        </SheetPortalContext.Provider>
        {showCloseButton && (
          <Tooltip
            content="Close sheet"
            render={
              <SheetPrimitive.Close
                className="icon-button sheet-close"
                aria-label="Close sheet"
              >
                <X size={19} />
              </SheetPrimitive.Close>
            }
          />
        )}
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  );
}

export function SheetHeader(props: ComponentProps<"div">) {
  return <div data-slot="sheet-header" className="sheet-header" {...props} />;
}

export function SheetTitle(props: SheetPrimitive.Title.Props) {
  return <SheetPrimitive.Title data-slot="sheet-title" {...props} />;
}

export function SheetDescription(props: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description data-slot="sheet-description" {...props} />
  );
}
