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

function to_scope_list(values: unknown, legacy: unknown): string[] {
  const raw = Array.isArray(values)
    ? values
    : typeof legacy === "string"
      ? [legacy]
      : [];
  return raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

export function migrate_scope(raw: unknown): RagScope {
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  const scope: RagScope = {};
  const folders = to_scope_list(record.folders, record.folder);
  const tags = to_scope_list(record.tags, record.tag);
  const bases = to_scope_list(record.bases, undefined);
  if (folders.length) scope.folders = folders;
  if (tags.length) scope.tags = tags;
  if (bases.length) scope.bases = bases;
  return scope;
}
