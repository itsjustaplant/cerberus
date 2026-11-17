import { Button as KumoButton } from "@cloudflare/kumo/components/button";
import type { ComponentProps } from "react";

export function Button({
  className = "",
  type,
  ...props
}: ComponentProps<"button">) {
  const primary = /\bprimary\b/.test(className);
  const secondary = /\bsecondary\b/.test(className);
  const icon = /\bicon-button\b/.test(className);
  const destructive = /\bdelete-button\b/.test(className);
  const layout = className
    .split(" ")
    .filter(
      (name) =>
        ![
          "button",
          "primary",
          "secondary",
          "icon-button",
          "delete-button",
        ].includes(name),
    )
    .join(" ");
  return (
    <KumoButton
      type={type || (className.includes("form-submit") ? "submit" : "button")}
      variant={
        destructive
          ? "secondary-destructive"
          : primary
            ? "primary"
            : secondary
              ? "secondary"
              : "ghost"
      }
      {...(icon
        ? {
            shape: "square" as const,
            "aria-label": props["aria-label"] || props.title || "Item actions",
          }
        : { shape: "base" as const })}
      className={`cerberus-control ${layout}`}
      {...props}
    />
  );
}
