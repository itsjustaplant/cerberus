import { Input as KumoInput } from "@cloudflare/kumo/components/input";
import type { ComponentProps } from "react";
export function Input(
  props: Omit<ComponentProps<typeof KumoInput>, "size"> & { size?: number },
) {
  const { size: _size, ...rest } = props;
  return (
    <KumoInput
      aria-label={
        props["aria-label"] || (!props.label ? props.name : undefined)
      }
      {...rest}
    />
  );
}
