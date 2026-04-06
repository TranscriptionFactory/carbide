import type { ActivationEvent } from "../ports";

export function matches_activation_event(
  declared: ActivationEvent,
  incoming: ActivationEvent,
): boolean {
  if (declared === incoming) return true;

  if (
    declared.startsWith("on_file_type:") &&
    incoming.startsWith("on_file_type:")
  ) {
    const declared_ext = declared.slice("on_file_type:".length).toLowerCase();
    const incoming_ext = incoming.slice("on_file_type:".length).toLowerCase();
    return declared_ext === incoming_ext;
  }

  if (
    declared.startsWith("vault_contains:") &&
    incoming.startsWith("vault_contains:")
  ) {
    const declared_pattern = declared.slice("vault_contains:".length);
    const incoming_path = incoming.slice("vault_contains:".length);
    return file_matches_vault_contains(incoming_path, declared_pattern);
  }

  return false;
}

export function should_activate_for_events(
  declared_events: ActivationEvent[] | undefined,
  incoming: ActivationEvent,
): boolean {
  if (!declared_events || declared_events.length === 0) {
    return incoming === "on_startup";
  }
  return declared_events.some((e) => matches_activation_event(e, incoming));
}

export function extract_file_extension(file_path: string): string | null {
  const dot_index = file_path.lastIndexOf(".");
  if (dot_index === -1 || dot_index === file_path.length - 1) return null;
  return file_path.slice(dot_index + 1).toLowerCase();
}

export function file_matches_vault_contains(
  path: string,
  pattern: string,
): boolean {
  const normalized_path = path.replace(/\\/g, "/");
  const normalized_pattern = pattern.replace(/\\/g, "/");

  if (normalized_path === normalized_pattern) return true;
  if (normalized_path.endsWith("/" + normalized_pattern)) return true;
  if (normalized_path.startsWith(normalized_pattern + "/")) return true;

  if (normalized_pattern.startsWith(".")) {
    const filename = normalized_path.split("/").pop() ?? "";
    return (
      filename === normalized_pattern || filename.endsWith(normalized_pattern)
    );
  }

  return false;
}
