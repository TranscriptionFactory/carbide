export function normalize_folder_scope(
  folder: string | undefined | null,
): string | null {
  const trimmed = (folder ?? "").trim().replace(/^\/+|\/+$/g, "");
  return trimmed === "" ? null : `${trimmed}/`;
}

export function path_in_folder(
  note_path: string,
  folder_prefix: string,
): boolean {
  return note_path.startsWith(folder_prefix);
}

export function normalize_tag_scope(
  tag: string | undefined | null,
): string | null {
  const trimmed = (tag ?? "").trim().replace(/^#+/, "");
  return trimmed === "" ? null : trimmed;
}
