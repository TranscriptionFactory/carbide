import type {
  LocalNoteLinksSnapshot,
  NoteLinksSnapshot,
  NoteStats,
  RewriteResult,
  SearchPort,
} from "$lib/features/search/ports";
import type { VaultId, NoteId } from "$lib/shared/types/ids";
import type {
  NoteSearchHit,
  PlannedLinkSuggestion,
  SearchQuery,
  WikiSuggestion,
  SemanticSearchHit,
  HybridSearchHit,
  EmbeddingStatus,
  HitSource,
} from "$lib/shared/types/search";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";

type TauriNoteMeta = {
  id: string;
  path: string;
  title: string;
  name: string;
  blurb: string;
  mtime_ms: number;
  size_bytes: number;
  file_type: string | null;
};

type TauriSearchHit = {
  note: TauriNoteMeta;
  score: number;
  snippet: string | null;
  snippet_page: number | null;
};

type TauriSuggestionHit = {
  note: TauriNoteMeta;
  score: number;
};

type TauriPlannedSuggestionHit = {
  target_path: string;
  ref_count: number;
};

type TauriOrphanLink = {
  target_path: string;
  ref_count: number;
};

type TauriLinksSnapshot = {
  backlinks: TauriNoteMeta[];
  outlinks: TauriNoteMeta[];
  orphan_links: TauriOrphanLink[];
};

type TauriSemanticSearchHit = {
  note: TauriNoteMeta;
  distance: number;
};

type TauriHybridSearchHit = {
  note: TauriNoteMeta;
  score: number;
  snippet: string | null;
  snippet_page: number | null;
  source: HitSource;
};

type TauriEmbeddingStatus = {
  total_notes: number;
  embedded_notes: number;
  model_version: string;
  is_embedding: boolean;
};

type TauriExternalLink = {
  url: string;
  text: string;
};

type TauriLocalLinksSnapshot = {
  outlink_paths: string[];
  external_links: TauriExternalLink[];
};

function to_note_meta(hit: TauriNoteMeta) {
  return {
    id: hit.id as NoteId,
    path: hit.path as NoteId,
    title: hit.title,
    name: hit.name,
    blurb: hit.blurb,
    mtime_ms: hit.mtime_ms,
    size_bytes: hit.size_bytes,
    file_type: hit.file_type,
  };
}

function map_existing_wiki_suggestions(
  hits: TauriSuggestionHit[],
): WikiSuggestion[] {
  return hits.map((hit) => ({
    kind: "existing" as const,
    note: to_note_meta(hit.note),
    score: hit.score,
  }));
}

function map_planned_link_suggestions(
  hits: TauriPlannedSuggestionHit[],
): PlannedLinkSuggestion[] {
  return hits.map((hit) => ({
    target_path: hit.target_path,
    ref_count: hit.ref_count,
  }));
}

function map_note_links_snapshot(
  snapshot: TauriLinksSnapshot,
): NoteLinksSnapshot {
  return {
    backlinks: snapshot.backlinks.map(to_note_meta),
    outlinks: snapshot.outlinks.map(to_note_meta),
    orphan_links: snapshot.orphan_links.map((orphan) => ({
      target_path: orphan.target_path,
      ref_count: orphan.ref_count,
    })),
  };
}

function map_local_note_links_snapshot(
  snapshot: TauriLocalLinksSnapshot,
): LocalNoteLinksSnapshot {
  return {
    outlink_paths: snapshot.outlink_paths,
    external_links: snapshot.external_links.map((link) => ({
      url: link.url,
      text: link.text,
    })),
  };
}

export function create_search_tauri_adapter(): SearchPort {
  const invoke_search = <Result>(
    command: string,
    payload: Record<string, unknown>,
  ) => tauri_invoke<Result>(command, payload);

  return {
    async search_notes(
      vault_id: VaultId,
      query: SearchQuery,
      limit = 50,
    ): Promise<NoteSearchHit[]> {
      const hits = await invoke_search<TauriSearchHit[]>("index_search", {
        vaultId: vault_id,
        query,
      });
      return hits.slice(0, limit).map((hit) => ({
        note: to_note_meta(hit.note),
        score: hit.score,
        snippet: hit.snippet ?? undefined,
        snippet_page: hit.snippet_page ?? undefined,
      }));
    },

    async suggest_wiki_links(
      vault_id: VaultId,
      query: string,
      limit = 15,
    ): Promise<WikiSuggestion[]> {
      const hits = await invoke_search<TauriSuggestionHit[]>("index_suggest", {
        vaultId: vault_id,
        query,
        limit,
      });
      return map_existing_wiki_suggestions(hits);
    },

    async suggest_planned_links(
      vault_id: VaultId,
      query: string,
      limit = 15,
    ): Promise<PlannedLinkSuggestion[]> {
      const hits = await invoke_search<TauriPlannedSuggestionHit[]>(
        "index_suggest_planned",
        {
          vaultId: vault_id,
          query,
          limit,
        },
      );
      return map_planned_link_suggestions(hits);
    },

    async get_note_links_snapshot(
      vault_id: VaultId,
      note_path: string,
    ): Promise<NoteLinksSnapshot> {
      const snapshot = await invoke_search<TauriLinksSnapshot>(
        "index_note_links_snapshot",
        {
          vaultId: vault_id,
          noteId: note_path,
        },
      );
      return map_note_links_snapshot(snapshot);
    },

    async extract_local_note_links(
      vault_id: VaultId,
      note_path: string,
      markdown: string,
    ): Promise<LocalNoteLinksSnapshot> {
      const snapshot = await invoke_search<TauriLocalLinksSnapshot>(
        "index_extract_local_note_links",
        {
          vaultId: vault_id,
          noteId: note_path,
          markdown,
        },
      );
      return map_local_note_links_snapshot(snapshot);
    },

    async rewrite_note_links(
      markdown: string,
      old_source_path: string,
      new_source_path: string,
      target_map: Record<string, string>,
    ): Promise<RewriteResult> {
      return invoke_search<RewriteResult>("rewrite_note_links", {
        markdown,
        oldSourcePath: old_source_path,
        newSourcePath: new_source_path,
        targetMap: target_map,
      });
    },

    async resolve_note_link(
      source_path: string,
      raw_target: string,
    ): Promise<string | null> {
      return invoke_search<string | null>("resolve_note_link", {
        sourcePath: source_path,
        rawTarget: raw_target,
      });
    },

    async resolve_wiki_link(
      source_path: string,
      raw_target: string,
    ): Promise<string | null> {
      return invoke_search<string | null>("resolve_wiki_link", {
        sourcePath: source_path,
        rawTarget: raw_target,
      });
    },

    async find_similar_notes(
      vault_id: VaultId,
      note_path: string,
      limit = 5,
      exclude_linked = true,
    ): Promise<SemanticSearchHit[]> {
      const hits = await invoke_search<TauriSemanticSearchHit[]>(
        "find_similar_notes",
        {
          vaultId: vault_id,
          notePath: note_path,
          limit,
          excludeLinked: exclude_linked,
        },
      );
      return hits.map((hit) => ({
        note: to_note_meta(hit.note),
        distance: hit.distance,
      }));
    },

    async semantic_search(
      vault_id: VaultId,
      query: string,
      limit = 20,
    ): Promise<SemanticSearchHit[]> {
      const hits = await invoke_search<TauriSemanticSearchHit[]>(
        "semantic_search",
        { vaultId: vault_id, query, limit },
      );
      return hits.map((hit) => ({
        note: to_note_meta(hit.note),
        distance: hit.distance,
      }));
    },

    async hybrid_search(
      vault_id: VaultId,
      query: string,
      limit = 20,
    ): Promise<HybridSearchHit[]> {
      const hits = await invoke_search<TauriHybridSearchHit[]>(
        "hybrid_search",
        { vaultId: vault_id, query, limit },
      );
      return hits.map((hit) => ({
        note: to_note_meta(hit.note),
        score: hit.score,
        snippet: hit.snippet ?? undefined,
        snippet_page: hit.snippet_page ?? undefined,
        source: hit.source,
      }));
    },

    async semantic_search_batch(
      vault_id: VaultId,
      paths: string[],
      limit: number,
      distance_threshold: number,
    ): Promise<{ source: string; target: string; distance: number }[]> {
      return invoke_search<
        { source: string; target: string; distance: number }[]
      >("semantic_search_batch", {
        vaultId: vault_id,
        paths,
        limit,
        distanceThreshold: distance_threshold,
      });
    },

    async get_embedding_status(vault_id: VaultId): Promise<EmbeddingStatus> {
      return invoke_search<TauriEmbeddingStatus>("get_embedding_status", {
        vaultId: vault_id,
      });
    },

    async rebuild_embeddings(vault_id: VaultId): Promise<void> {
      await invoke_search<undefined>("rebuild_embeddings", {
        vaultId: vault_id,
      });
    },

    async get_note_stats(
      vault_id: VaultId,
      note_path: string,
    ): Promise<NoteStats> {
      return invoke_search<NoteStats>("get_note_stats", {
        vaultId: vault_id,
        notePath: note_path,
      });
    },
  };
}
