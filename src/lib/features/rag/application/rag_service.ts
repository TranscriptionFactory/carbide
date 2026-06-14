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
import {
  build_citation_map,
  resolve_citations,
} from "$lib/features/rag/domain/rag_citations";
import type {
  RagCitation,
  RagQueryResult,
  RagRetrievedContext,
} from "$lib/features/rag/domain/rag_types";

const log = create_logger("rag_service");

const DEFAULT_RETRIEVE_LIMIT = 15;
const DEFAULT_CONTEXT_LIMIT = 8;
const NO_RESULTS_MESSAGE =
  "I couldn't find anything in your vault that answers that.";

function to_citation(context: RagRetrievedContext): RagCitation {
  return {
    index: context.index,
    note_path: context.note_path,
    title: context.title,
  };
}

export class RagService {
  constructor(
    private readonly search_port: SearchPort,
    private readonly notes_port: NotesPort,
    private readonly ai_stream_port: AiStreamPort,
    private readonly vault_store: VaultStore,
  ) {}

  async query(input: {
    question: string;
    provider_config: AiProviderConfig;
    retrieve_limit?: number;
    context_limit?: number;
    assembler_options?: AssembleContextOptions;
  }): Promise<RagQueryResult> {
    const vault = this.vault_store.vault;
    if (!vault) return this.failed("No active vault");

    let hits;
    try {
      hits = await this.search_port.hybrid_search(
        vault.id,
        { raw: input.question, text: input.question, scope: "all" },
        input.retrieve_limit ?? DEFAULT_RETRIEVE_LIMIT,
      );
    } catch (err) {
      log.warn("RAG retrieval failed", { error: error_message(err) });
      return this.failed("Search failed. Try again.");
    }

    if (hits.length === 0) return this.no_results();

    const top = hits.slice(0, input.context_limit ?? DEFAULT_CONTEXT_LIMIT);
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

    if (candidates.length === 0) return this.no_results();

    const contexts = assemble_context(candidates, input.assembler_options);
    const { system_prompt, user_prompt } = build_rag_prompt({
      question: input.question,
      contexts,
    });

    const { text, error } = await this.accumulate_stream(
      input.provider_config,
      system_prompt,
      user_prompt,
    );

    if (error && !text) return this.failed(error);

    const citation_map = build_citation_map(contexts.map(to_citation));
    const citations = resolve_citations(text, citation_map);

    return {
      content: text,
      citations,
      contexts,
      status: "answered",
      error: error ?? null,
    };
  }

  private async accumulate_stream(
    provider_config: AiProviderConfig,
    system_prompt: string,
    user_prompt: string,
  ): Promise<{ text: string; error: string | null }> {
    let text = "";
    for await (const chunk of this.ai_stream_port.stream_text({
      provider_config,
      system_prompt,
      messages: [{ role: "user", content: user_prompt }],
    })) {
      if (chunk.type === "text") {
        text += chunk.text;
      } else if (chunk.type === "error") {
        return { text, error: chunk.error };
      }
    }
    return { text, error: null };
  }

  private failed(error: string): RagQueryResult {
    return {
      content: "",
      citations: [],
      contexts: [],
      status: "failed",
      error,
    };
  }

  private no_results(): RagQueryResult {
    return {
      content: NO_RESULTS_MESSAGE,
      citations: [],
      contexts: [],
      status: "no_results",
      error: null,
    };
  }
}
