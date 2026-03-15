import type { VaultId, NoteId } from "$lib/shared/types/ids";
import type {
  NoteSearchHit,
  OrphanLink,
  PlannedLinkSuggestion,
  SearchQuery,
  WikiSuggestion,
  IndexProgressEvent,
  SemanticSearchHit,
  HybridSearchHit,
  EmbeddingStatus,
  EmbeddingProgressEvent,
} from "$lib/shared/types/search";
import type { NoteMeta } from "$lib/shared/types/note";
import type { ExternalLink } from "$lib/features/links";

export type { IndexProgressEvent };

export type NoteLinksSnapshot = {
  backlinks: NoteMeta[];
  outlinks: NoteMeta[];
  orphan_links: OrphanLink[];
};

export type LocalNoteLinksSnapshot = {
  outlink_paths: string[];
  external_links: ExternalLink[];
};

export type RewriteResult = {
  markdown: string;
  changed: boolean;
};

export interface SearchPort {
  search_notes(
    vault_id: VaultId,
    query: SearchQuery,
    limit?: number,
  ): Promise<NoteSearchHit[]>;
  suggest_wiki_links(
    vault_id: VaultId,
    query: string,
    limit?: number,
  ): Promise<WikiSuggestion[]>;
  suggest_planned_links(
    vault_id: VaultId,
    query: string,
    limit?: number,
  ): Promise<PlannedLinkSuggestion[]>;
  get_note_links_snapshot(
    vault_id: VaultId,
    note_path: string,
  ): Promise<NoteLinksSnapshot>;
  extract_local_note_links(
    vault_id: VaultId,
    note_path: string,
    markdown: string,
  ): Promise<LocalNoteLinksSnapshot>;
  rewrite_note_links(
    markdown: string,
    old_source_path: string,
    new_source_path: string,
    target_map: Record<string, string>,
  ): Promise<RewriteResult>;
  resolve_note_link(
    source_path: string,
    raw_target: string,
  ): Promise<string | null>;
  resolve_wiki_link(
    source_path: string,
    raw_target: string,
  ): Promise<string | null>;
  find_similar_notes(
    vault_id: VaultId,
    note_path: string,
    limit?: number,
    exclude_linked?: boolean,
  ): Promise<SemanticSearchHit[]>;
  semantic_search(
    vault_id: VaultId,
    query: string,
    limit?: number,
  ): Promise<SemanticSearchHit[]>;
  hybrid_search(
    vault_id: VaultId,
    query: string,
    limit?: number,
  ): Promise<HybridSearchHit[]>;
  get_embedding_status(vault_id: VaultId): Promise<EmbeddingStatus>;
  rebuild_embeddings(vault_id: VaultId): Promise<void>;
}

export interface WorkspaceIndexPort {
  cancel_index(vault_id: VaultId): Promise<void>;
  sync_index(vault_id: VaultId): Promise<void>;
  rebuild_index(vault_id: VaultId): Promise<void>;
  list_note_paths_by_prefix(
    vault_id: VaultId,
    prefix: string,
  ): Promise<string[]>;
  upsert_note(vault_id: VaultId, note_id: NoteId): Promise<void>;
  remove_note(vault_id: VaultId, note_id: NoteId): Promise<void>;
  remove_notes(vault_id: VaultId, note_ids: NoteId[]): Promise<void>;
  rename_note_path(
    vault_id: VaultId,
    old_path: NoteId,
    new_path: NoteId,
  ): Promise<void>;
  remove_notes_by_prefix(vault_id: VaultId, prefix: string): Promise<void>;
  rename_folder_paths(
    vault_id: VaultId,
    old_prefix: string,
    new_prefix: string,
  ): Promise<void>;
  subscribe_index_progress(
    callback: (event: IndexProgressEvent) => void,
  ): () => void;
  subscribe_embedding_progress(
    callback: (event: EmbeddingProgressEvent) => void,
  ): () => void;
  embed_sync(vault_id: VaultId): Promise<void>;
}
