import { note_name_from_path } from "$lib/shared/utils/path";
import type { AssistantScope } from "$lib/features/assistant/types/session";
import type { RetrievalScope } from "$lib/features/assistant/types/retrieval";

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

// A note path, like a base path, is matched whole: no prefix shape to
// canonicalize, only the empty case to reject so a blank chip cannot narrow
// the scope to nothing. Same rule, so literally the same function — two
// identical-by-contract copies would eventually drift.
export const normalize_note_scope = normalize_base_scope;

function normalize_all(
  values: string[] | undefined,
  normalize: (value: string) => string | null,
): string[] {
  return (values ?? [])
    .map(normalize)
    .filter((value): value is string => value !== null);
}

// The only way to produce a RetrievalScope. The composer owns the scope syntax
// it renders, so canonicalizing it belongs here rather than behind the port —
// retrieval only ever needed "does this path start with this prefix".
export function to_retrieval_scope(scope: AssistantScope): RetrievalScope {
  return {
    folders: normalize_all(scope.folders, normalize_folder_scope),
    tags: normalize_all(scope.tags, normalize_tag_scope),
    bases: normalize_all(scope.bases, normalize_base_scope),
    notes: normalize_all(scope.notes, normalize_note_scope),
  } as RetrievalScope;
}

function join_human(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function scope_phrase(scope: AssistantScope): string {
  const parts: string[] = [];
  const notes = scope.notes ?? [];
  const folders = scope.folders ?? [];
  const tags = scope.tags ?? [];
  const bases = scope.bases ?? [];

  // Notes lead: they are the narrowest dimension, and a prompt reads better
  // naming the note before the folder it happens to sit in.
  if (notes.length) {
    const label = notes.map((n) => `"${note_name_from_path(n)}"`);
    parts.push(
      `the ${notes.length > 1 ? "notes" : "note"} ${join_human(label)}`,
    );
  }
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
