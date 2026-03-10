import type { SearchPort } from "$lib/features/search";
import type { VaultId } from "$lib/shared/types/ids";
import type {
  NoteSearchHit,
  PlannedLinkSuggestion,
  SearchQuery,
  WikiSuggestion,
} from "$lib/shared/types/search";

function source_dir_from_path(path: string): string {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(0, index) : "";
}

function resolve_relative_path(
  source_dir: string,
  target: string,
): string | null {
  const segments = source_dir ? source_dir.split("/") : [];

  for (const part of target.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(part);
  }

  return segments.length > 0 ? segments.join("/") : null;
}

export function create_test_search_adapter(): SearchPort {
  return {
    search_notes(
      _vault_id: VaultId,
      _query: SearchQuery,
      _limit?: number,
    ): Promise<NoteSearchHit[]> {
      return Promise.resolve([]);
    },

    suggest_wiki_links(
      _vault_id: VaultId,
      _query: string,
      _limit?: number,
    ): Promise<WikiSuggestion[]> {
      return Promise.resolve([]);
    },

    suggest_planned_links(
      _vault_id: VaultId,
      _query: string,
      _limit?: number,
    ): Promise<PlannedLinkSuggestion[]> {
      return Promise.resolve([]);
    },

    get_note_links_snapshot(_vault_id: VaultId, _note_path: string) {
      return Promise.resolve({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      });
    },

    extract_local_note_links(
      _vault_id: VaultId,
      _note_path: string,
      _markdown: string,
    ) {
      return Promise.resolve({
        outlink_paths: [],
        external_links: [],
      });
    },

    rewrite_note_links(
      markdown: string,
      _old_source_path: string,
      _new_source_path: string,
      _target_map: Record<string, string>,
    ) {
      return Promise.resolve({ markdown, changed: false });
    },

    resolve_note_link(source_path: string, raw_target: string) {
      const trimmed = raw_target.trim();
      const base_dir = trimmed.startsWith("/")
        ? ""
        : source_dir_from_path(source_path);
      const cleaned = trimmed.replace(/^\//, "");
      if (!cleaned) return Promise.resolve(null);
      const with_ext = cleaned.endsWith(".md") ? cleaned : `${cleaned}.md`;
      return Promise.resolve(resolve_relative_path(base_dir, with_ext));
    },

    resolve_wiki_link(source_path: string, raw_target: string) {
      const cleaned = raw_target.trim().replace(/^\//, "");
      if (!cleaned) return Promise.resolve(null);
      const with_ext = cleaned.endsWith(".md") ? cleaned : `${cleaned}.md`;
      const base_dir =
        cleaned.startsWith("./") || cleaned.startsWith("../")
          ? source_dir_from_path(source_path)
          : "";
      return Promise.resolve(resolve_relative_path(base_dir, with_ext));
    },
  };
}
