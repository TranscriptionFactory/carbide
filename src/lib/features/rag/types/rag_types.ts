import type { HitSource } from "$lib/shared/types/search";
import type {
  AssistantChatMode,
  AssistantChatSourceInfo,
  AssistantCitation,
  AssistantContextStats,
  AssistantMessage,
  AssistantRole,
  AssistantScope,
  AssistantSession,
  AssistantSessionSummary,
  AssistantTitleSource,
  AssistantToolCall,
  AssistantToolEvent,
} from "$lib/features/assistant";

// I4: chat sessions live in the assistant store, so these are names for the
// assistant's types rather than a second set of definitions. Only the shapes
// with no assistant counterpart — retrieval, sources, the stream event — are
// still declared here.
export type RagCitation = AssistantCitation;

export type RagRetrievedContext = {
  index: number;
  note_path: string;
  title: string;
  text: string;
  score: number;
  source: HitSource;
  truncated?: boolean;
};

export type RagContextStats = AssistantContextStats;

export type RagRole = AssistantRole;

export type RagToolEvent = AssistantToolEvent;

export type RagToolCall = AssistantToolCall;

export type RagMessage = AssistantMessage;

export type RagSourceInfo = AssistantChatSourceInfo;

export type RagStreamEvent =
  | { type: "generating" }
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "citation"; citation: RagCitation }
  | { type: "sources"; stats: RagContextStats; sources: RagSourceInfo[] }
  | { type: "done" }
  | { type: "error"; error: string };

export type RagScope = AssistantScope;

export type RagSessionSummary = AssistantSessionSummary;

export type RagTitleSource = AssistantTitleSource;

export type RagSessionMode = AssistantChatMode;

export type RagSession = AssistantSession;
