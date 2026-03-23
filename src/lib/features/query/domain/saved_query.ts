const QUERY_EXTENSION = ".query";
const INVALID_CHARS = /[<>:"|?*\\]/;
const MAX_NAME_LENGTH = 200;

export function query_path_from_name(name: string): string {
  return name + QUERY_EXTENSION;
}

export function query_name_from_path(path: string): string {
  const filename = path.split("/").pop() ?? path;
  if (filename.endsWith(QUERY_EXTENSION)) {
    return filename.slice(0, -QUERY_EXTENSION.length);
  }
  return filename;
}

export type QueryNameValidation =
  | { valid: true }
  | { valid: false; reason: string };

export function validate_query_name(name: string): QueryNameValidation {
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
    return {
      valid: false,
      reason: "Name contains invalid characters",
    };
  }
  if (trimmed.startsWith(".")) {
    return { valid: false, reason: "Name cannot start with a dot" };
  }
  return { valid: true };
}
