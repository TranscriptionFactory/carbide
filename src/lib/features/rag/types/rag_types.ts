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
};

export type RagRole = "user" | "assistant";

export type RagMessage = {
  id: string;
  role: RagRole;
  content: string;
  citations: RagCitation[];
};

export type RagStreamEvent =
  | { type: "generating" }
  | { type: "text"; text: string }
  | { type: "citation"; citation: RagCitation }
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

export type RagSession = RagSessionSummary & {
  messages: RagMessage[];
  provider_id: string;
  scope: RagScope;
};
