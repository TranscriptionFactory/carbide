import type { HitSource } from "$lib/shared/types/search";

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

export type RagRole = "user" | "assistant";

export type RagMessage = {
  id: string;
  role: RagRole;
  content: string;
  citations: RagCitation[];
  context_stats?: RagContextStats;
};

export type RagStreamEvent =
  | { type: "generating" }
  | { type: "text"; text: string }
  | { type: "citation"; citation: RagCitation }
  | { type: "sources"; stats: RagContextStats }
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

export type RagSession = RagSessionSummary & {
  messages: RagMessage[];
  provider_id: string;
  scope: RagScope;
  title_source?: RagTitleSource;
};
