import type { HitSource } from "$lib/shared/types/search";
import type {
  AssistantCitation,
  AssistantContextStats,
} from "$lib/features/assistant/types/session";

// The chat turn's own event payloads.
//
// `pinned` records that the note was [[mentioned]] rather than retrieved, which
// is a property of how it entered the turn, not of the note.
export type AssistantChatSourceInfo = {
  note_path: string;
  title: string;
  score: number;
  truncated: boolean;
  pinned: boolean;
};

// Post-budget assembled context, not retrieval output: produced by the
// assembler from blocks that survived the token budget, and consumed by the
// prompt builder. It was named RagRetrievedContext in rag, which read as a
// retrieval type and is why the alias hub looked undissolvable.
export type AssistantRetrievedContext = {
  index: number;
  note_path: string;
  title: string;
  text: string;
  score: number;
  source: HitSource;
  truncated?: boolean;
};

export type AssistantChatStreamEvent =
  | { type: "generating" }
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "citation"; citation: AssistantCitation }
  | {
      type: "sources";
      stats: AssistantContextStats;
      sources: AssistantChatSourceInfo[];
    }
  | { type: "done" }
  | { type: "error"; error: string };
