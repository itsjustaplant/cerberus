import { Button } from "./ui/button";
import { useState } from "react";
import { Dialog } from "@cloudflare/kumo/primitives/dialog";
import {
  CaretLeftIcon as ChevronLeft,
  CaretRightIcon as ChevronRight,
  XIcon as X,
  MagnifyingGlassPlusIcon as ZoomIn,
  MagnifyingGlassMinusIcon as ZoomOut,
} from "@phosphor-icons/react";

export type GalleryImage = { src: string; alt: string };

export function ImageGallery({
  images,
  className = "",
}: {
  images: GalleryImage[];
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const image = images[index];
  function step(direction: number) {
    setIndex(
      (current) => (current + direction + images.length) % images.length,
    );
    setZoomed(false);
  }
  return (
    <Dialog.Root
      open={open && !!image}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setZoomed(false);
      }}
    >
      <div className={className}>
        {images.map((photo, position) => (
          <Button
            className="image-zoom-trigger"
            key={photo.src}
            aria-label={`Enlarge ${photo.alt}`}
            onClick={() => {
              setIndex(position);
              setZoomed(false);
              setOpen(true);
            }}
          >
            <img src={photo.src} alt={photo.alt} loading="lazy" />
          </Button>
        ))}
      </div>
      <Dialog.Portal>
        <Dialog.Backdrop className="gallery-backdrop" />
        <Dialog.Popup
          className="gallery-popup"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              event.stopPropagation();
              step(event.key === "ArrowLeft" ? -1 : 1);
            }
          }}
        >
          <div className="gallery-toolbar">
            <Dialog.Title>Image viewer</Dialog.Title>
            <span role="status" aria-live="polite">
              {index + 1} / {images.length}
            </span>
            <Button
              className="icon-button"
              aria-label={zoomed ? "Fit image" : "Zoom in"}
              onClick={() => setZoomed(!zoomed)}
            >
              {zoomed ? <ZoomOut size={20} /> : <ZoomIn size={20} />}
            </Button>
            <Dialog.Close
              className="icon-button"
              aria-label="Close image viewer"
            >
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Use the previous and next buttons or left and right arrow keys to
            switch images.
          </Dialog.Description>
          <div
            className={`gallery-stage ${zoomed ? "is-zoomed" : ""}`}
            key={image?.src}
          >
            {image && <img src={image.src} alt={image.alt} />}
          </div>
          {images.length > 1 && (
            <div className="gallery-navigation">
              <Button
                className="button secondary"
                aria-label="Previous image"
                onClick={() => step(-1)}
              >
                <ChevronLeft size={20} />
                <span>Previous</span>
                <span
                  className="gallery-navigation-spacer"
                  aria-hidden="true"
                />
              </Button>
              <Button
                className="button secondary"
                aria-label="Next image"
                onClick={() => step(1)}
              >
                <span
                  className="gallery-navigation-spacer"
                  aria-hidden="true"
                />
                <span>Next</span>
                <ChevronRight size={20} />
              </Button>
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
