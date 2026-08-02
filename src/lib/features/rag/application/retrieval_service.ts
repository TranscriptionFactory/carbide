import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";
import type { VaultStore } from "$lib/features/vault";
import type { SearchPort } from "$lib/features/search";
import type { NotesPort } from "$lib/features/note";
import type { TagPort } from "$lib/features/tags";
import type { BasesPort } from "$lib/features/bases";
import type { NoteId, VaultId } from "$lib/shared/types/ids";
import { is_linked_note_path } from "$lib/shared/types/note";
import { analyze_query } from "$lib/features/rag/domain/rag_query_analysis";
import { derive_rag_readiness } from "$lib/features/rag/domain/rag_readiness";
import type { RagReadiness } from "$lib/features/rag/types/rag_readiness";
import type {
  RetrievalOutcome,
  RetrievalRequest,
  RetrievalScope,
  RetrievedNote,
} from "$lib/features/rag/types/retrieval_contract";
import type {
  BlockSectionHit,
  DateRange,
  HitSource,
  HybridSearchHit,
} from "$lib/shared/types/search";

const log = create_logger("retrieval_service");

const DEFAULT_RETRIEVE_LIMIT = 15;
// The read bound: only this many hits can survive the assembler's max_blocks,
// so only these are read from disk. The assistant caps spend separately.
const MAX_RETRIEVED_NOTES = 8;
const SCOPE_OVERFETCH = 6;
const CITED_NOTE_BOOST = 1.25;

class RagScopeError extends Error {
  constructor(readonly label: string) {
    super(`scope:${label}`);
    this.name = "RagScopeError";
  }
}

type RetrievalHit = {
  note_path: string;
  note_id: NoteId;
  title: string;
  score: number;
  source: HitSource;
  section?: { start_line: number; end_line: number };
};

function block_to_hit(block: BlockSectionHit): RetrievalHit {
  return {
    note_path: block.note.path,
    note_id: block.note.id,
    title: block.note.title,
    score: 1 / (1 + block.distance),
    source: "vector",
    section: { start_line: block.start_line, end_line: block.end_line },
  };
}

function note_to_hit(hit: HybridSearchHit): RetrievalHit {
  return {
    note_path: hit.note.path,
    note_id: hit.note.id,
    title: hit.note.title,
    score: hit.score,
    source: hit.source,
  };
}

function boost_cited_notes(
  hits: RetrievalHit[],
  boost_paths: string[],
): RetrievalHit[] {
  if (boost_paths.length === 0) return hits;
  const boosted = new Set(boost_paths);
  return hits
    .map((hit) =>
      boosted.has(hit.note_path)
        ? { ...hit, score: hit.score * CITED_NOTE_BOOST }
        : hit,
    )
    .sort((a, b) => b.score - a.score);
}

const PINNED_SOURCE = "pinned";
const RETRIEVED_SOURCE = "retrieved";

function compare_ids(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

// Mention order is intrinsic to the question, so pinned ids encode it. Padded,
// because ids break score ties lexicographically: "pinned:10" must not sort
// ahead of "pinned:2".
function pinned_block_id(rank: number): string {
  return `${PINNED_SOURCE}:${String(rank).padStart(3, "0")}`;
}

// Retrieval order is not intrinsic — the same vault can return the same hits in
// any order — so a retrieved id is keyed by what the hit *is*. Ranking by
// position here would leak search order into the assembled context.
function retrieved_block_id(hit: RetrievalHit): string {
  const section = hit.section
    ? `#${String(hit.section.start_line)}-${String(hit.section.end_line)}`
    : "";
  return `${RETRIEVED_SOURCE}:${hit.note_path}${section}`;
}

// Sorting by the assembler's own key keeps the read bound from changing the
// answer.
function take_top(hits: RetrievalHit[], limit: number): RetrievalHit[] {
  return [...hits]
    .sort(
      (a, b) =>
        b.score - a.score ||
        compare_ids(retrieved_block_id(a), retrieved_block_id(b)),
    )
    .slice(0, limit);
}

export class RetrievalService {
  constructor(
    private readonly search_port: SearchPort,
    private readonly notes_port: NotesPort,
    private readonly vault_store: VaultStore,
    private readonly tag_port: TagPort,
    private readonly bases_port: BasesPort,
  ) {}

  async check_readiness(): Promise<RagReadiness> {
    const vault = this.vault_store.vault;
    if (!vault) return { state: "checking" };
    try {
      const status = await this.search_port.get_embedding_status(vault.id);
      return derive_rag_readiness(status);
    } catch (err) {
      const reason = error_message(err);
      log.warn("RAG embedding status check failed", { error: reason });
      return { state: "unavailable", reason };
    }
  }

  async retrieve(request: RetrievalRequest): Promise<RetrievalOutcome> {
    const vault = this.vault_store.vault;
    if (!vault) return { status: "no_vault" };

    const analysis = analyze_query(request.query, Date.now());
    const retrieval_query =
      analysis.topic !== "" ? analysis.topic : request.query;

    const pinned = await this.resolve_pinned(vault.id, request.pinned_titles);
    const pinned_paths = new Set(pinned.map((hit) => hit.note_path));

    let hits: RetrievalHit[];
    try {
      hits = await this.search(
        vault.id,
        retrieval_query,
        analysis.date_range,
        this.effective_retrieve_limit(request),
      );
    } catch (err) {
      log.warn("RAG retrieval failed", { error: error_message(err) });
      return { status: "search_failed" };
    }

    const unscoped_hit_count = hits.length;
    try {
      hits = await this.apply_scope(vault.id, hits, request.scope);
    } catch (err) {
      if (err instanceof RagScopeError) {
        return { status: "scope_failed", scope_label: err.label };
      }
      throw err;
    }
    hits = hits.filter((hit) => !pinned_paths.has(hit.note_path));

    if (hits.length === 0 && pinned.length === 0) {
      if (this.scope_is_active(request.scope) && unscoped_hit_count > 0) {
        return { status: "scope_filtered" };
      }
      return { status: "empty" };
    }

    const ranked = boost_cited_notes(hits, request.boost_paths);
    const [pinned_notes, retrieved_notes] = await Promise.all([
      this.read_notes(vault.id, pinned, (_hit, rank) => pinned_block_id(rank)),
      this.read_notes(
        vault.id,
        take_top(ranked, MAX_RETRIEVED_NOTES),
        retrieved_block_id,
      ),
    ]);

    return {
      status: "hits",
      pinned: pinned_notes,
      retrieved: retrieved_notes,
    };
  }

  private async resolve_pinned(
    vault_id: VaultId,
    titles: string[],
  ): Promise<RetrievalHit[]> {
    if (titles.length === 0) return [];

    const resolved = await Promise.all(
      titles.map(async (name): Promise<RetrievalHit | null> => {
        try {
          const suggestions = await this.search_port.suggest_wiki_links(
            vault_id,
            name,
            1,
          );
          const existing = suggestions.find((s) => s.kind === "existing");
          if (!existing) return null;
          return {
            note_path: existing.note.path,
            note_id: existing.note.id,
            title: existing.note.title,
            score: 0,
            source: "both",
          };
        } catch (err) {
          log.warn("RAG mention resolution failed", {
            mention: name,
            error: error_message(err),
          });
          return null;
        }
      }),
    );

    const seen = new Set<string>();
    const pinned: RetrievalHit[] = [];
    for (const hit of resolved) {
      if (!hit || seen.has(hit.note_path)) continue;
      seen.add(hit.note_path);
      pinned.push(hit);
    }
    return pinned;
  }

  private scope_is_active(scope: RetrievalScope | undefined): boolean {
    if (!scope) return false;
    return (
      (scope.folders?.length ?? 0) +
        (scope.tags?.length ?? 0) +
        (scope.bases?.length ?? 0) +
        (scope.notes?.length ?? 0) >
      0
    );
  }

  private effective_retrieve_limit(request: RetrievalRequest): number {
    const base = request.limit ?? DEFAULT_RETRIEVE_LIMIT;
    return this.scope_is_active(request.scope) ? base * SCOPE_OVERFETCH : base;
  }

  private async search(
    vault_id: VaultId,
    query: string,
    date_range: DateRange | null,
    limit: number,
  ): Promise<RetrievalHit[]> {
    const [notes, blocks] = await Promise.all([
      this.search_port.hybrid_search(
        vault_id,
        { raw: query, text: query, scope: "all" },
        limit,
        date_range,
      ),
      this.search_port
        .search_blocks(vault_id, query, limit, date_range)
        .catch((err) => {
          log.warn("RAG block retrieval failed; using whole-note context", {
            error: error_message(err),
          });
          return [] as BlockSectionHit[];
        }),
    ]);

    if (notes.length === 0) {
      return blocks.map(block_to_hit);
    }

    const section_by_path = new Map<string, BlockSectionHit>();
    for (const block of blocks) {
      if (!section_by_path.has(block.note.path)) {
        section_by_path.set(block.note.path, block);
      }
    }

    return notes.map((hit) => {
      const base = note_to_hit(hit);
      const block = section_by_path.get(hit.note.path);
      if (block) {
        base.section = {
          start_line: block.start_line,
          end_line: block.end_line,
        };
      }
      return base;
    });
  }

  private async apply_scope(
    vault_id: VaultId,
    hits: RetrievalHit[],
    scope: RetrievalScope | undefined,
  ): Promise<RetrievalHit[]> {
    const notes = scope?.notes ?? [];
    if (notes.length > 0) {
      const allowed = new Set(notes);
      hits = hits.filter((hit) => allowed.has(hit.note_path));
    }

    const folders = scope?.folders ?? [];
    if (folders.length > 0) {
      hits = hits.filter((hit) =>
        folders.some((folder) => hit.note_path.startsWith(folder)),
      );
    }

    hits = await this.keep_in_note_set(
      hits,
      scope?.tags ?? [],
      (tag) => this.tag_port.get_notes_for_tag(vault_id, tag),
      "tag",
    );

    return this.keep_in_note_set(
      hits,
      scope?.bases ?? [],
      async (path) => {
        const view = await this.bases_port.load_view(vault_id, path);
        const result = await this.bases_port.query(vault_id, {
          ...view.query,
          limit: 10000,
          offset: 0,
        });
        return result.rows.map((row) => row.note.path);
      },
      "base",
    );
  }

  private async keep_in_note_set(
    hits: RetrievalHit[],
    values: string[],
    resolve: (value: string) => Promise<string[]>,
    label: string,
  ): Promise<RetrievalHit[]> {
    if (values.length === 0) return hits;
    try {
      const sets = await Promise.all(values.map(resolve));
      const allowed = new Set<string>(sets.flat());
      return hits.filter((hit) => allowed.has(hit.note_path));
    } catch (err) {
      log.warn(`RAG ${label} scope filter failed`, {
        error: error_message(err),
      });
      throw new RagScopeError(label);
    }
  }

  private async read_hit_markdown(
    vault_id: VaultId,
    hit: RetrievalHit,
  ): Promise<string | null> {
    if (is_linked_note_path(hit.note_path)) {
      return this.search_port.get_indexed_body(vault_id, hit.note_path);
    }
    const doc = await this.notes_port.read_note(vault_id, hit.note_id);
    return doc.markdown;
  }

  // A note that cannot be read is dropped here: the read is an index-facing
  // concern. Whether a *slice* of it is worth spending is the assembler's call.
  private async read_notes(
    vault_id: VaultId,
    hits: RetrievalHit[],
    id_for: (hit: RetrievalHit, rank: number) => string,
  ): Promise<RetrievedNote[]> {
    const notes = await Promise.all(
      hits.map(async (hit, rank): Promise<RetrievedNote | null> => {
        try {
          const markdown = await this.read_hit_markdown(vault_id, hit);
          if (markdown == null) return null;
          return {
            id: id_for(hit, rank),
            note_path: hit.note_path,
            title: hit.title,
            markdown,
            score: hit.score,
            source_tag: hit.source,
            section: hit.section ?? null,
          };
        } catch (err) {
          log.warn("Failed to read retrieved note", {
            path: hit.note_path,
            error: error_message(err),
          });
          return null;
        }
      }),
    );
    return notes.filter((note): note is RetrievedNote => note !== null);
  }
}
