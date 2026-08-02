import { create_logger } from "$lib/shared/utils/logger";
import type { AiImagePart } from "$lib/features/ai";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { HitSource } from "$lib/shared/types/search";
import type { RetrievalPort } from "$lib/features/assistant/ports";
import type {
  RetrievalReadiness,
  RetrievedNote,
} from "$lib/features/assistant/types/retrieval";
import type {
  AssistantMessage,
  AssistantScope,
} from "$lib/features/assistant/types/session";
import type {
  AssistantChatStreamEvent,
  AssistantRetrievedContext,
} from "$lib/features/assistant/types/chat_stream";
import type { RunHandle, RunStarter } from "$lib/features/assistant/types/run";
import { start_run_stream } from "$lib/features/assistant/application/run_stream";
import {
  assemble_context,
  DEFAULT_CONTEXT_BUDGET,
  type AssembledBlock,
  type ContextAssembly,
  type ContextBudget,
} from "$lib/features/assistant/domain/context_assembler";
import type { ContextBlock } from "$lib/features/assistant/domain/context_source";
import { extract_line_range } from "$lib/features/assistant/domain/context_window";
import { build_chat_prompt } from "$lib/features/assistant/domain/chat_prompt_builder";
import { build_citation_map } from "$lib/features/assistant/domain/chat_citations";
import { ChatStreamParser } from "$lib/features/assistant/domain/chat_stream_parser";
import { rewrite_query } from "$lib/features/assistant/domain/query_rewriter";
import { parse_mentions } from "$lib/features/assistant/domain/mention_tokens";
import { to_retrieval_scope } from "$lib/features/assistant/domain/chat_scope";
import type { AssistantCitation } from "$lib/features/assistant/types/session";

const log = create_logger("assistant_chat_service");

// The spend bound. Distinct from retrieval's read bound, which limits how many
// notes come back off disk; this limits how many survive the budget.
const DEFAULT_CONTEXT_LIMIT = 8;
const PINNED_SOURCE = "pinned";
const RETRIEVED_SOURCE = "retrieved";
const VAULT_DEDUP_GROUP = "vault";

const NO_RESULTS_MESSAGE =
  "I couldn't find anything in your vault that answers that.";
const SCOPE_FILTERED_MESSAGE =
  "I found matching notes, but your active scope filtered them all out. Try widening or clearing the scope.";

// source_tag carries the HitSource this block was retrieved by.
function to_contexts(blocks: AssembledBlock[]): AssistantRetrievedContext[] {
  return blocks.map((block) => ({
    index: block.index,
    note_path: block.note_path ?? "",
    title: block.title,
    text: block.text,
    score: block.score,
    source: block.source_tag as HitSource,
    truncated: block.truncated,
  }));
}

// Every note we read, whether or not the budget kept it — the pre-assembly
// count the sources event has always reported.
function distinct_note_paths(assembly: ContextAssembly): number {
  const paths = new Set<string>();
  for (const block of assembly.blocks) {
    if (block.note_path !== null) paths.add(block.note_path);
  }
  for (const dropped of assembly.dropped) {
    if (dropped.note_path !== null) paths.add(dropped.note_path);
  }
  return paths.size;
}

function to_citation(context: AssistantRetrievedContext): AssistantCitation {
  return {
    index: context.index,
    note_path: context.note_path,
    title: context.title,
  };
}

// Slicing is a budget decision, so it happens here rather than behind the port.
// A sectioned hit whose slice is whitespace-only is dropped before assembly:
// spending budget on it would buy nothing.
function to_block(note: RetrievedNote, pinned: boolean): ContextBlock | null {
  const text = note.section
    ? extract_line_range(
        note.markdown,
        note.section.start_line,
        note.section.end_line,
      )
    : note.markdown;
  if (note.section && text.trim().length === 0) return null;
  return {
    id: note.id,
    note_path: note.note_path,
    title: note.title,
    text,
    score: note.score,
    source_tag: note.source_tag,
    pinned,
  };
}

function to_blocks(notes: RetrievedNote[], pinned: boolean): ContextBlock[] {
  return notes
    .map((note) => to_block(note, pinned))
    .filter((block): block is ContextBlock => block !== null);
}

export type AssistantChatQueryInput = {
  question: string;
  provider_config: AiProviderConfig;
  history?: AssistantMessage[];
  scope?: AssistantScope;
  retrieve_limit?: number;
  assembler_options?: Partial<ContextBudget>;
  image_parts?: AiImagePart[];
  // The kernel owns cancellation, so a caller that needs a Stop takes the
  // handle rather than pushing a signal down.
  on_run_started?: (handle: RunHandle) => void;
};

export class AssistantChatService {
  constructor(
    private readonly retrieval: RetrievalPort,
    private readonly run_starter: RunStarter,
  ) {}

  check_readiness(): Promise<RetrievalReadiness> {
    return this.retrieval.check_readiness();
  }

  async *query(
    input: AssistantChatQueryInput,
  ): AsyncGenerator<AssistantChatStreamEvent> {
    const { mentions, cleaned_question } = parse_mentions(input.question);

    const rewrite = rewrite_query({
      question: cleaned_question,
      history: input.history ?? [],
    });

    const outcome = await this.retrieval.retrieve({
      query: rewrite.query,
      pinned_titles: mentions,
      boost_paths: rewrite.boost_paths,
      ...(input.scope ? { scope: to_retrieval_scope(input.scope) } : {}),
      ...(input.retrieve_limit === undefined
        ? {}
        : { limit: input.retrieve_limit }),
    });

    if (outcome.status === "no_vault") {
      yield { type: "error", error: "No active vault" };
      return;
    }
    if (outcome.status === "search_failed") {
      yield { type: "error", error: "Search failed. Try again." };
      return;
    }
    if (outcome.status === "scope_failed") {
      yield {
        type: "error",
        error: `Couldn't apply the ${outcome.scope_label} scope filter, so I stopped instead of searching outside your scope. Try again.`,
      };
      return;
    }
    if (outcome.status === "scope_filtered") {
      yield { type: "text", text: SCOPE_FILTERED_MESSAGE };
      yield { type: "done" };
      return;
    }
    if (outcome.status === "empty") {
      yield* this.no_results();
      return;
    }

    const pinned_blocks = to_blocks(outcome.pinned, true);
    const retrieved_blocks = to_blocks(outcome.retrieved, false);
    if (pinned_blocks.length + retrieved_blocks.length === 0) {
      yield* this.no_results();
      return;
    }

    const pinned_paths = new Set(outcome.pinned.map((note) => note.note_path));

    const assembly = assemble_context(
      [
        {
          id: PINNED_SOURCE,
          dedup_group: VAULT_DEDUP_GROUP,
          blocks: pinned_blocks,
        },
        {
          id: RETRIEVED_SOURCE,
          dedup_group: VAULT_DEDUP_GROUP,
          max_blocks: DEFAULT_CONTEXT_LIMIT,
          blocks: retrieved_blocks,
        },
      ],
      { ...DEFAULT_CONTEXT_BUDGET, ...input.assembler_options },
    );
    const contexts = to_contexts(assembly.blocks);

    yield {
      type: "sources",
      stats: {
        retrieved: distinct_note_paths(assembly),
        used: contexts.length,
        truncated: assembly.stats.truncated,
      },
      sources: contexts.map((c) => ({
        note_path: c.note_path,
        title: c.title,
        score: c.score,
        truncated: c.truncated === true,
        pinned: pinned_paths.has(c.note_path),
      })),
    };

    const { system_prompt, history, user_prompt } = build_chat_prompt({
      question: cleaned_question,
      contexts,
      history: input.history ?? [],
    });

    const parser = new ChatStreamParser(
      build_citation_map(contexts.map(to_citation)),
    );

    const { handle, events } = await start_run_stream(this.run_starter, {
      kind: "chat",
      label: cleaned_question,
      provider: input.provider_config,
      request: {
        mode: "text",
        system_prompt,
        messages: [
          ...history,
          {
            role: "user",
            content: input.image_parts?.length
              ? [{ type: "text", text: user_prompt }, ...input.image_parts]
              : user_prompt,
          },
        ],
      },
    });
    input.on_run_started?.(handle);

    try {
      yield { type: "generating" };
      for await (const event of events) {
        if (event.type === "text") {
          yield* parser.push(event.text);
        } else if (event.type === "reasoning") {
          yield { type: "reasoning", text: event.text };
        } else if (event.type === "error") {
          // The kernel humanized this already; it is the single choke point.
          log.warn("Chat stream failed", { error: event.message });
          yield { type: "error", error: event.message };
          return;
        } else if (event.type === "end" && event.outcome.status === "aborted") {
          // Keep what the model said, but never report done: a stopped answer
          // must not render as a complete one.
          yield* parser.flush();
          return;
        }
      }

      yield* parser.flush();
      yield { type: "done" };
    } finally {
      handle.stop();
    }
  }

  private async *no_results(): AsyncGenerator<AssistantChatStreamEvent> {
    const readiness = await this.check_readiness();
    if (readiness.state === "indexing") {
      yield {
        type: "text",
        text: `I couldn't find anything yet — your vault is still being indexed (${readiness.embedded} of ${readiness.total} notes). Try again once indexing finishes.`,
      };
    } else {
      yield { type: "text", text: NO_RESULTS_MESSAGE };
    }
    yield { type: "done" };
  }
}
