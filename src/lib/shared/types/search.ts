import type { NoteMeta } from "$lib/shared/types/note";
import type { CommandDefinition } from "$lib/features/search";

export type { SearchCommandDefinition } from "$lib/features/search";

export type SearchSettingDefinition = {
  key: string;
  label: string;
  description: string;
  category: string;
  keywords: string[];
};

export type SearchScope = "all" | "path" | "title" | "content";
export type SearchDomain = "notes" | "commands" | "planned";
export type OmnibarScope = "current_vault" | "all_vaults";

export type SearchQuery = {
  raw: string;
  text: string;
  scope: SearchScope;
  domain: SearchDomain;
};

export type SearchQueryInput = Pick<SearchQuery, "raw" | "text" | "scope">;

export type NoteSearchHit = {
  note: NoteMeta;
  score: number;
  snippet?: string | undefined;
  snippet_page?: number | undefined;
};

export type PlannedLinkSuggestion = {
  target_path: string;
  ref_count: number;
};

export type OrphanLink = PlannedLinkSuggestion;

export type ExistingWikiSuggestion = {
  kind: "existing";
  note: NoteMeta;
  score: number;
};

export type PlannedWikiSuggestion = {
  kind: "planned";
  target_path: string;
  ref_count: number;
  score: number;
};

export type WikiSuggestion = ExistingWikiSuggestion | PlannedWikiSuggestion;

export type InFileMatch = {
  line: number;
  column: number;
  length: number;
  context: string;
};

type IndexProgressMeta = {
  mode?: "smart" | "dumb";
  run_id?: number;
  queued_work_items?: number;
};

export type IndexProgressEvent =
  | ({ status: "started"; vault_id: string; total: number } & IndexProgressMeta)
  | ({
      status: "progress";
      vault_id: string;
      indexed: number;
      total: number;
    } & IndexProgressMeta)
  | ({
      status: "completed";
      vault_id: string;
      indexed: number;
      elapsed_ms: number;
    } & IndexProgressMeta)
  | ({ status: "failed"; vault_id: string; error: string } & IndexProgressMeta);

export type SemanticSearchHit = {
  note: NoteMeta;
  distance: number;
};

export type HitSource = "fts" | "vector" | "both";

export type HybridSearchHit = {
  note: NoteMeta;
  score: number;
  snippet?: string | undefined;
  snippet_page?: number | undefined;
  source: HitSource;
};

export type EmbeddingStatus = {
  total_notes: number;
  embedded_notes: number;
  model_version: string;
  is_embedding: boolean;
};

export type EmbeddingProgressEvent =
  | { status: "started"; vault_id: string; total: number }
  | {
      status: "progress";
      vault_id: string;
      embedded: number;
      total: number;
    }
  | {
      status: "completed";
      vault_id: string;
      embedded: number;
      elapsed_ms: number;
    }
  | { status: "failed"; vault_id: string; error: string }
  | { status: "block_started"; vault_id: string; total: number }
  | {
      status: "block_progress";
      vault_id: string;
      embedded: number;
      total: number;
    }
  | { status: "block_completed"; vault_id: string; embedded: number };

export type OmnibarItem =
  | {
      kind: "note";
      note: NoteMeta;
      score: number;
      snippet?: string | undefined;
      snippet_page?: number | undefined;
      source?: HitSource | undefined;
    }
  | {
      kind: "cross_vault_note";
      note: NoteMeta;
      vault_id: string;
      vault_name: string;
      vault_note_count?: number | null;
      vault_last_opened_at?: number | null;
      vault_is_available?: boolean;
      score: number;
      snippet?: string | undefined;
      snippet_page?: number | undefined;
    }
  | {
      kind: "planned_note";
      target_path: string;
      ref_count: number;
      score: number;
    }
  | { kind: "command"; command: CommandDefinition; score: number }
  | { kind: "setting"; setting: SearchSettingDefinition; score: number }
  | { kind: "recent_note"; note: NoteMeta };
