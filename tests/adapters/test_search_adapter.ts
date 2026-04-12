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

function strip_link_suffix(raw_target: string): string {
  return raw_target.trim().replace(/[?#].*$/, "");
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
      const trimmed = strip_link_suffix(raw_target);
      const base_dir = trimmed.startsWith("/")
        ? ""
        : source_dir_from_path(source_path);
      const cleaned = trimmed.replace(/^\//, "");
      if (!cleaned) return Promise.resolve(null);
      const leaf = cleaned.split("/").at(-1) ?? cleaned;
      const candidate = leaf.includes(".") ? cleaned : `${cleaned}.md`;
      return Promise.resolve(resolve_relative_path(base_dir, candidate));
    },

    resolve_wiki_link(source_path: string, raw_target: string) {
      const cleaned = strip_link_suffix(raw_target).replace(/^\//, "");
      if (!cleaned) return Promise.resolve(null);
      const with_ext = cleaned.endsWith(".md") ? cleaned : `${cleaned}.md`;
      const base_dir =
        cleaned.startsWith("./") || cleaned.startsWith("../")
          ? source_dir_from_path(source_path)
          : "";
      return Promise.resolve(resolve_relative_path(base_dir, with_ext));
    },

    find_similar_notes: () => Promise.resolve([]),
    semantic_search_batch: () => Promise.resolve([]),
    semantic_search: () => Promise.resolve([]),
    hybrid_search: () => Promise.resolve([]),
    get_embedding_status: () =>
      Promise.resolve({
        total_notes: 0,
        embedded_notes: 0,
        model_version: "unavailable",
        is_embedding: false,
      }),
    rebuild_embeddings: () => Promise.resolve(),
    get_note_stats: (_vault_id: VaultId, _note_path: string) =>
      Promise.resolve({
        word_count: 0,
        char_count: 0,
        heading_count: 0,
        outlink_count: 0,
        reading_time_secs: 0,
        task_count: 0,
        tasks_done: 0,
        tasks_todo: 0,
        next_due_date: null,
        last_indexed_at: 0,
      }),
    get_file_cache: (_vault_id: VaultId, _note_path: string) =>
      Promise.resolve({
        frontmatter: {},
        tags: [],
        headings: [],
        links: [],
        embeds: [],
        stats: {
          word_count: 0,
          char_count: 0,
          heading_count: 0,
          outlink_count: 0,
          reading_time_secs: 0,
          task_count: 0,
          tasks_done: 0,
          tasks_todo: 0,
          next_due_date: null,
          last_indexed_at: 0,
        },
        ctime_ms: 0,
        mtime_ms: 0,
        size_bytes: 0,
      }),
    load_smart_link_rules: () => Promise.resolve([]),
    save_smart_link_rules: () => Promise.resolve(),
    compute_smart_link_suggestions: () => Promise.resolve([]),
    compute_smart_link_vault_edges: () => Promise.resolve([]),
  };
}
