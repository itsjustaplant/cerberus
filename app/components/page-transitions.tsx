import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router";

export function PageTransitions() {
  const { pathname, search } = useLocation();
  const key = pathname + search;
  const previous = useRef(key);

  useLayoutEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    if (
      document.documentElement.dataset.inputModality === "keyboard" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const content = document.querySelector("[data-page-content]");
    if (!content) return;
    // Animate only the new content; navigation and the persistent shell stay immediate.
    const animation = content.animate(
      [
        { opacity: 0.6, transform: "translateY(4px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      {
        duration: 150,
        easing: getComputedStyle(document.documentElement)
          .getPropertyValue("--ease-out")
          .trim(),
      },
    );
    return () => animation.cancel();
  }, [key]);

  return null;
}
