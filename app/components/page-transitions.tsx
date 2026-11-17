import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router";

export function PageTransitions() {
  const { pathname } = useLocation();
  const previous = useRef(pathname);

  useLayoutEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    if (
      document.documentElement.dataset.inputModality === "keyboard" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const content = document.querySelector("[data-page-content]");
    if (!content) return;
    // Filters, search, pagination, and tag revalidation update in place.
    // Only entering a different page replays the page transition.
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
  }, [pathname]);

  return null;
}
