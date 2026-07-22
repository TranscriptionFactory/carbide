import type { HitSource } from "$lib/shared/types/search";
import type { AgentPermissionMode } from "$lib/features/rag/types/agent_events";

export type RagCitation = {
  index: number;
  note_path: string;
  title: string;
};

export type RagRetrievedContext = {
  index: number;
  note_path: string;
  title: string;
  text: string;
  score: number;
  source: HitSource;
  truncated?: boolean;
};

export type RagContextStats = {
  retrieved: number;
  used: number;
  truncated: number;
};

export type RagRole = "user" | "assistant" | "tool";

export type RagToolEvent = {
  name: string;
  input_summary: string;
  ok?: boolean;
};

export type RagToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type RagMessage = {
  id: string;
  role: RagRole;
  content: string;
  citations: RagCitation[];
  context_stats?: RagContextStats;
  reasoning?: string;
  tool_events?: RagToolEvent[];
  tool_calls?: RagToolCall[];
  tool_call_id?: string;
};

export type RagSourceInfo = {
  note_path: string;
  title: string;
  score: number;
  truncated: boolean;
  pinned: boolean;
};

export type RagStreamEvent =
  | { type: "generating" }
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "citation"; citation: RagCitation }
  | { type: "sources"; stats: RagContextStats; sources: RagSourceInfo[] }
  | { type: "done" }
  | { type: "error"; error: string };

export type RagScope = {
  folders?: string[];
  tags?: string[];
  bases?: string[];
};

export type RagSessionSummary = {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
};

export type RagTitleSource = "derived" | "generated" | "manual";

export type RagSessionMode = "ask" | "agent";

export type RagSession = RagSessionSummary & {
  messages: RagMessage[];
  provider_id: string;
  scope: RagScope;
  title_source?: RagTitleSource;
  mode: RagSessionMode;
  permission_mode: AgentPermissionMode;
  changed_files: string[];
  agent_session_id?: string;
};
