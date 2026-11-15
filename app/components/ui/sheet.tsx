// shadcn/ui Base UI Sheet, adapted to Cerberus's CSS theme.
// https://ui.shadcn.com/docs/components/base/sheet
import type { ComponentProps } from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

export function SheetContent({
  className = "",
  children,
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & { showCloseButton?: boolean }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop
        data-slot="sheet-overlay"
        className="sheet-overlay"
      />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side="right"
        className={`sheet-content ${className}`}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            className="icon-button sheet-close"
            aria-label="Close sheet"
          >
            <X size={19} />
          </SheetPrimitive.Close>
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
