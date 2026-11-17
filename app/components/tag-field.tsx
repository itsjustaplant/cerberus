import { useRef, useState } from "react";
import { TagInput } from "@cloudflare/kumo/components/tag-input";
import { Input } from "./ui/input";

function normalize(tag: string) {
  return tag.normalize("NFKC").trim().replace(/^#/, "").trim().toLowerCase();
}

export function TagField({
  label = "Tags",
  description = "Press Enter or comma to add a tag. Up to 10 tags, 32 characters each.",
  defaultValue = [],
  required = false,
  disabled = false,
}: {
  label?: string;
  description?: string;
  defaultValue?: string[];
  required?: boolean;
  disabled?: boolean;
}) {
  const [tags, setTags] = useState(defaultValue);
  const input = useRef<HTMLInputElement>(null);
  const validationMessage = useRef("");
  return (
    <div className="tag-input-field">
      <TagInput
        ref={input}
        label={label}
        aria-label={label}
        description={description}
        value={tags}
        onValueChange={(values) => setTags([...new Set(values.map(normalize))])}
        validateValue={(value, accepted) => {
          const tag = normalize(value);
          const next = new Set([...accepted.map(normalize), tag]);
          const message =
            !tag || tag.length > 32 || /[\x00-\x1f\x7f,]/.test(tag)
              ? "Use 1–32 characters without commas or control characters."
              : [...next].filter((entry) => entry !== "twitter").length > 10
                ? "Use at most 10 tags. The automatic twitter tag is kept separately."
                : "";
          validationMessage.current = message;
          input.current?.setCustomValidity(message);
          return !message;
        }}
        labels={{ invalidValue: () => validationMessage.current }}
        onChange={() => input.current?.setCustomValidity("")}
        placeholder="Add a tag…"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required={required}
        disabled={disabled}
        className="cerberus-tag-input"
      />
      <Input
        type="hidden"
        name="tags"
        value={tags.join(",")}
        disabled={disabled}
      />
    </div>
  );
}
