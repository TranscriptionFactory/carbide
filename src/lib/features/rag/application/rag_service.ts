import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";
import type { VaultStore } from "$lib/features/vault";
import type { SearchPort } from "$lib/features/search";
import type { NotesPort } from "$lib/features/note";
import type { AiStreamPort } from "$lib/features/ai";
import type { TagPort } from "$lib/features/tags";
import type { BasesPort } from "$lib/features/bases/ports";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { NoteId, VaultId } from "$lib/shared/types/ids";
import { is_linked_note_path } from "$lib/shared/types/note";
import {
  assemble_context,
  extract_section,
  type AssembleContextOptions,
  type RagContextCandidate,
} from "$lib/features/rag/domain/rag_context_assembler";
import { build_rag_prompt } from "$lib/features/rag/domain/rag_prompt_builder";
import { build_citation_map } from "$lib/features/rag/domain/rag_citations";
import { RagStreamParser } from "$lib/features/rag/domain/rag_stream_parser";
import { rewrite_query } from "$lib/features/rag/domain/rag_query_rewriter";
import { parse_mentions } from "$lib/features/rag/domain/rag_mentions";
import {
  normalize_folder_scope,
  normalize_tag_scope,
  normalize_base_scope,
  path_in_folder,
} from "$lib/features/rag/domain/rag_scope";
import type {
  RagCitation,
  RagMessage,
  RagRetrievedContext,
  RagScope,
  RagSession,
  RagSessionSummary,
  RagStreamEvent,
} from "$lib/features/rag/domain/rag_types";
import type { RagPersistencePort } from "$lib/features/rag/ports";
import type {
  BlockSectionHit,
  HitSource,
  HybridSearchHit,
} from "$lib/shared/types/search";

const log = create_logger("rag_service");

const DEFAULT_RETRIEVE_LIMIT = 15;
const DEFAULT_CONTEXT_LIMIT = 8;
const CITED_NOTE_BOOST = 1.25;
const PINNED_SCORE = Number.MAX_SAFE_INTEGER;
const NO_RESULTS_MESSAGE =
  "I couldn't find anything in your vault that answers that.";

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

function to_citation(context: RagRetrievedContext): RagCitation {
  return {
    index: context.index,
    note_path: context.note_path,
    title: context.title,
  };
}

export type RagQueryInput = {
  question: string;
  provider_config: AiProviderConfig;
  history?: RagMessage[];
  scope?: RagScope;
  retrieve_limit?: number;
  context_limit?: number;
  assembler_options?: AssembleContextOptions;
};

export class RagService {
  constructor(
    private readonly search_port: SearchPort,
    private readonly notes_port: NotesPort,
    private readonly ai_stream_port: AiStreamPort,
    private readonly vault_store: VaultStore,
    private readonly persistence_port: RagPersistencePort,
    private readonly tag_port: TagPort,
    private readonly bases_port: BasesPort,
  ) {}

  async list_sessions(vault_id: string): Promise<RagSessionSummary[]> {
    try {
      return await this.persistence_port.list_sessions(vault_id);
    } catch (err) {
      log.warn("RAG list_sessions failed", { error: error_message(err) });
      return [];
    }
  }

  async load_session(vault_id: string, id: string): Promise<RagSession | null> {
    try {
      return await this.persistence_port.load_session(vault_id, id);
    } catch (err) {
      log.warn("RAG load_session failed", { error: error_message(err) });
      return null;
    }
  }

  async save_session(vault_id: string, session: RagSession): Promise<void> {
    try {
      await this.persistence_port.save_session(vault_id, session);
    } catch (err) {
      log.warn("RAG save_session failed", { error: error_message(err) });
    }
  }

  async delete_session(vault_id: string, id: string): Promise<void> {
    try {
      await this.persistence_port.delete_session(vault_id, id);
    } catch (err) {
      log.warn("RAG delete_session failed", { error: error_message(err) });
    }
  }

  async *query(input: RagQueryInput): AsyncGenerator<RagStreamEvent> {
    const vault = this.vault_store.vault;
    if (!vault) {
      yield { type: "error", error: "No active vault" };
      return;
    }

    const { mentions, cleaned_question } = parse_mentions(input.question);

    const rewrite = rewrite_query({
      question: cleaned_question,
      history: input.history ?? [],
    });

    const pinned = await this.resolve_pinned(vault.id, mentions);
    const pinned_paths = new Set(pinned.map((hit) => hit.note_path));

    let hits: RetrievalHit[];
    try {
      hits = await this.retrieve(vault.id, rewrite.query, input);
    } catch (err) {
      log.warn("RAG retrieval failed", { error: error_message(err) });
      yield { type: "error", error: "Search failed. Try again." };
      return;
    }

    hits = await this.apply_scope(vault.id, hits, input.scope);
    hits = hits.filter((hit) => !pinned_paths.has(hit.note_path));

    if (hits.length === 0 && pinned.length === 0) {
      yield* this.no_results();
      return;
    }

    const ranked = boost_cited_notes(hits, rewrite.boost_paths);
    const top = ranked.slice(0, input.context_limit ?? DEFAULT_CONTEXT_LIMIT);
    const candidates = await this.build_candidates(vault.id, [
      ...pinned,
      ...top,
    ]);

    if (candidates.length === 0) {
      yield* this.no_results();
      return;
    }

    const contexts = assemble_context(candidates, input.assembler_options);
    const { system_prompt, user_prompt } = build_rag_prompt({
      question: cleaned_question,
      contexts,
      history: input.history ?? [],
    });

    const parser = new RagStreamParser(
      build_citation_map(contexts.map(to_citation)),
    );

    const controller = new AbortController();
    try {
      for await (const chunk of this.ai_stream_port.stream_text({
        provider_config: input.provider_config,
        system_prompt,
        messages: [{ role: "user", content: user_prompt }],
        signal: controller.signal,
      })) {
        if (chunk.type === "text") {
          yield* parser.push(chunk.text);
        } else if (chunk.type === "error") {
          yield { type: "error", error: chunk.error };
          return;
        }
      }

      yield* parser.flush();
      yield { type: "done" };
    } finally {
      controller.abort();
    }
  }

  private async resolve_pinned(
    vault_id: VaultId,
    mentions: string[],
  ): Promise<RetrievalHit[]> {
    if (mentions.length === 0) return [];

    const resolved = await Promise.all(
      mentions.map(async (name): Promise<RetrievalHit | null> => {
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
            score: PINNED_SCORE,
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

  private async retrieve(
    vault_id: VaultId,
    query: string,
    input: RagQueryInput,
  ): Promise<RetrievalHit[]> {
    const limit = input.retrieve_limit ?? DEFAULT_RETRIEVE_LIMIT;
    const [notes, blocks] = await Promise.all([
      this.search_port.hybrid_search(
        vault_id,
        { raw: query, text: query, scope: "all" },
        limit,
      ),
      this.search_port.search_blocks(vault_id, query, limit).catch((err) => {
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
    scope: RagScope | undefined,
  ): Promise<RetrievalHit[]> {
    const folders = (scope?.folders ?? [])
      .map(normalize_folder_scope)
      .filter((f): f is string => f !== null);
    if (folders.length > 0) {
      hits = hits.filter((hit) =>
        folders.some((folder) => path_in_folder(hit.note_path, folder)),
      );
    }

    const tags = (scope?.tags ?? [])
      .map(normalize_tag_scope)
      .filter((t): t is string => t !== null);
    if (tags.length > 0) {
      try {
        const sets = await Promise.all(
          tags.map((tag) => this.tag_port.get_notes_for_tag(vault_id, tag)),
        );
        const tagged = new Set(sets.flat());
        hits = hits.filter((hit) => tagged.has(hit.note_path));
      } catch (err) {
        log.warn("RAG tag scope filter failed", { error: error_message(err) });
      }
    }

    const bases = (scope?.bases ?? [])
      .map(normalize_base_scope)
      .filter((b): b is string => b !== null);
    if (bases.length > 0) {
      try {
        const sets = await Promise.all(
          bases.map(async (path) => {
            const view = await this.bases_port.load_view(vault_id, path);
            const result = await this.bases_port.query(vault_id, {
              ...view.query,
              limit: 10000,
              offset: 0,
            });
            return result.rows.map((row) => row.note.path);
          }),
        );
        const scoped = new Set<string>(sets.flat());
        hits = hits.filter((hit) => scoped.has(hit.note_path));
      } catch (err) {
        log.warn("RAG base scope filter failed", { error: error_message(err) });
      }
    }
    return hits;
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

  private async build_candidates(
    vault_id: VaultId,
    hits: RetrievalHit[],
  ): Promise<RagContextCandidate[]> {
    const candidates = await Promise.all(
      hits.map(async (hit): Promise<RagContextCandidate | null> => {
        try {
          const markdown = await this.read_hit_markdown(vault_id, hit);
          if (markdown == null) return null;
          const text = hit.section
            ? extract_section(
                markdown,
                hit.section.start_line,
                hit.section.end_line,
              )
            : markdown;
          if (hit.section && text.trim().length === 0) return null;
          return {
            note_path: hit.note_path,
            title: hit.title,
            text,
            score: hit.score,
            source: hit.source,
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
    return candidates.filter((c): c is RagContextCandidate => c !== null);
  }

  private *no_results(): Generator<RagStreamEvent> {
    yield { type: "text", text: NO_RESULTS_MESSAGE };
    yield { type: "done" };
  }
}
