const INVALID_CHARS = /[<>:"|?*\\]/;
const MAX_NAME_LENGTH = 200;

export type ListNameValidation =
  | { valid: true }
  | { valid: false; reason: string };

export function validate_list_name(name: string): ListNameValidation {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, reason: "Name cannot be empty" };
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return {
      valid: false,
      reason: `Name cannot exceed ${MAX_NAME_LENGTH} characters`,
    };
  }
  if (INVALID_CHARS.test(trimmed)) {
    return { valid: false, reason: "Name contains invalid characters" };
  }
  if (trimmed.startsWith(".")) {
    return { valid: false, reason: "Name cannot start with a dot" };
  }
  return { valid: true };
}

export function slugify_list_name(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}
