export class InputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function text(
  value: unknown,
  name: string,
  max: number,
  required = false,
) {
  if (value == null && !required) return "";
  if (typeof value !== "string") throw new InputError(`${name} must be text.`);
  const result = value.trim();
  if ((required && !result) || result.length > max)
    throw new InputError(
      `${name} must be ${required ? "1–" : "at most "}${max} characters.`,
    );
  return result;
}
