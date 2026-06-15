import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";
import type { VaultStore } from "$lib/features/vault";
import type { SearchPort } from "$lib/features/search";
import type { NotesPort } from "$lib/features/note";
import type { AiStreamPort } from "$lib/features/ai";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import {
  assemble_context,
  type AssembleContextOptions,
  type RagContextCandidate,
} from "$lib/features/rag/domain/rag_context_assembler";
import { build_rag_prompt } from "$lib/features/rag/domain/rag_prompt_builder";
import { build_citation_map } from "$lib/features/rag/domain/rag_citations";
import { RagStreamParser } from "$lib/features/rag/domain/rag_stream_parser";
import { rewrite_query } from "$lib/features/rag/domain/rag_query_rewriter";
import {
  normalize_folder_scope,
  path_in_folder,
} from "$lib/features/rag/domain/rag_scope";
import type {
  RagCitation,
  RagMessage,
  RagRetrievedContext,
  RagStreamEvent,
} from "$lib/features/rag/domain/rag_types";
import type { HybridSearchHit } from "$lib/shared/types/search";

const log = create_logger("rag_service");

const DEFAULT_RETRIEVE_LIMIT = 15;
const DEFAULT_CONTEXT_LIMIT = 8;
const CITED_NOTE_BOOST = 1.25;
const NO_RESULTS_MESSAGE =
  "I couldn't find anything in your vault that answers that.";

function boost_cited_notes(
  hits: HybridSearchHit[],
  boost_paths: string[],
): HybridSearchHit[] {
  if (boost_paths.length === 0) return hits;
  const boosted = new Set(boost_paths);
  return hits
    .map((hit) =>
      boosted.has(hit.note.path)
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
  scope?: string;
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
  ) {}

  async *query(input: RagQueryInput): AsyncGenerator<RagStreamEvent> {
    const vault = this.vault_store.vault;
    if (!vault) {
      yield { type: "error", error: "No active vault" };
      return;
    }

    const rewrite = rewrite_query({
      question: input.question,
      history: input.history ?? [],
    });

    let hits;
    try {
      hits = await this.search_port.hybrid_search(
        vault.id,
        { raw: rewrite.query, text: rewrite.query, scope: "all" },
        input.retrieve_limit ?? DEFAULT_RETRIEVE_LIMIT,
      );
    } catch (err) {
      log.warn("RAG retrieval failed", { error: error_message(err) });
      yield { type: "error", error: "Search failed. Try again." };
      return;
    }

    const folder_scope = normalize_folder_scope(input.scope);
    if (folder_scope) {
      hits = hits.filter((hit) => path_in_folder(hit.note.path, folder_scope));
    }

    if (hits.length === 0) {
      yield* this.no_results();
      return;
    }

    const ranked = boost_cited_notes(hits, rewrite.boost_paths);
    const top = ranked.slice(0, input.context_limit ?? DEFAULT_CONTEXT_LIMIT);
    const candidates = (
      await Promise.all(
        top.map(async (hit): Promise<RagContextCandidate | null> => {
          try {
            const doc = await this.notes_port.read_note(vault.id, hit.note.id);
            return {
              note_path: hit.note.path,
              title: hit.note.title,
              text: doc.markdown,
              score: hit.score,
              source: hit.source,
            };
          } catch (err) {
            log.warn("Failed to read retrieved note", {
              path: hit.note.path,
              error: error_message(err),
            });
            return null;
          }
        }),
      )
    ).filter((c): c is RagContextCandidate => c !== null);

    if (candidates.length === 0) {
      yield* this.no_results();
      return;
    }

    const contexts = assemble_context(candidates, input.assembler_options);
    const { system_prompt, user_prompt } = build_rag_prompt({
      question: input.question,
      contexts,
      history: input.history ?? [],
    });

    const parser = new RagStreamParser(
      build_citation_map(contexts.map(to_citation)),
    );

    for await (const chunk of this.ai_stream_port.stream_text({
      provider_config: input.provider_config,
      system_prompt,
      messages: [{ role: "user", content: user_prompt }],
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
  }

  private *no_results(): Generator<RagStreamEvent> {
    yield { type: "text", text: NO_RESULTS_MESSAGE };
    yield { type: "done" };
  }
}
