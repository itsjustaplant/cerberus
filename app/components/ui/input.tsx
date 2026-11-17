import { Input as KumoInput } from "@cloudflare/kumo/components/input";
import type { ComponentProps } from "react";
export function Input(props: ComponentProps<"input">) {
  const { size: _size, ...rest } = props;
  return <KumoInput aria-label={props["aria-label"] || props.name} {...rest} />;
}
