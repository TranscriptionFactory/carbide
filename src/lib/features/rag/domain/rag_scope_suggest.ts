import { filter_folder_paths } from "$lib/shared/utils/filter_folder_paths";
import { rank_tags } from "$lib/features/tags/domain/tag_matcher";
import type { TagInfo } from "$lib/features/tags/types";
import type { SavedViewInfo } from "$lib/features/bases/ports";
import type { RagScope } from "$lib/features/rag/domain/rag_types";

export type ScopeKind = "folder" | "tag" | "base";

export type ScopeSuggestion = {
  kind: ScopeKind;
  value: string;
  label: string;
  hint?: string;
};

export type ScopeSources = {
  folder_paths: string[];
  tags: TagInfo[];
  saved_views: SavedViewInfo[];
};

export type ScopeSuggestions = {
  folders: ScopeSuggestion[];
  tags: ScopeSuggestion[];
  bases: ScopeSuggestion[];
};

export function build_scope_suggestions(
  query: string,
  sources: ScopeSources,
  selected: RagScope,
): ScopeSuggestions {
  const chosen_folders = new Set(selected.folders ?? []);
  const chosen_tags = new Set(selected.tags ?? []);
  const chosen_bases = new Set(selected.bases ?? []);

  const folders: ScopeSuggestion[] = filter_folder_paths(
    query,
    sources.folder_paths,
  )
    .filter((path) => !chosen_folders.has(path))
    .map((path) => ({
      kind: "folder",
      value: path,
      label: path || "(vault root)",
    }));

  const count_by_tag = new Map(sources.tags.map((t) => [t.tag, t.count]));
  const tags: ScopeSuggestion[] = rank_tags(
    query,
    sources.tags.map((t) => t.tag),
  )
    .filter((match) => !chosen_tags.has(match.tag))
    .map((match) => ({
      kind: "tag",
      value: match.tag,
      label: `#${match.tag}`,
      hint: String(count_by_tag.get(match.tag) ?? 0),
    }));

  const needle = query.trim().toLowerCase();
  const bases: ScopeSuggestion[] = sources.saved_views
    .filter((view) => needle === "" || view.name.toLowerCase().includes(needle))
    .filter((view) => !chosen_bases.has(view.path))
    .map((view) => ({ kind: "base", value: view.path, label: view.name }));

  return { folders, tags, bases };
}
