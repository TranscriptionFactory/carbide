// C1 contracts — frozen for the cycle (E1). A lane needing a change files it
// to the orchestrator instead of editing.
//
// One session model for every conversational AI surface (I4): the chat panel,
// inline ⌁ history, and note-scoped threads are renderings of the same live
// object, never copies. Message shapes mirror rag's today; AU-010 re-points
// rag to these so there is a single source, and C3's inversion (AU-040/050)
// leaves them living here.

export type AssistantSessionKind = "inline" | "note" | "chat";

export type AssistantTitleSource = "derived" | "generated" | "manual";

export type AssistantChatMode = "ask" | "agent";

export type AssistantPermissionMode = "safe" | "power";

export type AssistantScope = {
  folders?: string[];
  tags?: string[];
  bases?: string[];
};

export type AssistantRole = "user" | "assistant" | "tool";

export type AssistantCitation = {
  index: number;
  note_path: string;
  title: string;
};

export type AssistantContextStats = {
  retrieved: number;
  used: number;
  truncated: number;
};

export type AssistantToolEvent = {
  name: string;
  input_summary: string;
  paths?: string[];
  ok?: boolean;
};

export type AssistantToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type AssistantMessage = {
  id: string;
  role: AssistantRole;
  content: string;
  citations: AssistantCitation[];
  context_stats?: AssistantContextStats;
  reasoning?: string;
  tool_events?: AssistantToolEvent[];
  tool_calls?: AssistantToolCall[];
  tool_call_id?: string;
  error?: string;
  // A turn the user stopped is not a turn that failed. `error` is the only
  // other status field, and reusing it here would re-merge the two states the
  // run stream exists to keep apart (C1 amendment D1-4).
  stopped?: boolean;
};

export type AssistantSessionSummary = {
  id: string;
  kind: AssistantSessionKind;
  title: string;
  created_at: number;
  updated_at: number;
};

// Flat rather than discriminated by kind: promote keeps kind + history (R3),
// so every kind must be able to carry the full conversational state. Fields a
// kind does not use hold their defaults.
export type AssistantSession = AssistantSessionSummary & {
  title_source: AssistantTitleSource;
  provider_id: string;
  messages: AssistantMessage[];
  origin: { note_path?: string };
  scope: AssistantScope;
  mode: AssistantChatMode;
  permission_mode: AssistantPermissionMode;
  changed_files: string[];
  agent_session_id?: string;
};

export function to_assistant_session_summary(
  session: AssistantSession,
): AssistantSessionSummary {
  return {
    id: session.id,
    kind: session.kind,
    title: session.title,
    created_at: session.created_at,
    updated_at: session.updated_at,
  };
}
