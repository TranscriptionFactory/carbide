import type { RagScope } from "$lib/features/rag/domain/rag_types";

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

export function normalize_base_scope(
  base: string | undefined | null,
): string | null {
  const trimmed = (base ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function join_human(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function scope_phrase(scope: RagScope): string {
  const parts: string[] = [];
  const folders = scope.folders ?? [];
  const tags = scope.tags ?? [];
  const bases = scope.bases ?? [];

  if (folders.length) {
    const label = folders.map((f) => `"${f.replace(/\/+$/, "")}"`);
    parts.push(
      `the ${folders.length > 1 ? "folders" : "folder"} ${join_human(label)}`,
    );
  }
  if (tags.length) {
    parts.push(
      `notes tagged ${join_human(tags.map((t) => `#${t.replace(/^#/, "")}`))}`,
    );
  }
  if (bases.length) {
    parts.push(`the ${join_human(bases.map((b) => `"${b}"`))} view`);
  }

  if (parts.length === 0) return "my vault";
  return join_human(parts);
}
