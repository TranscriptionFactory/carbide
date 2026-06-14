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

export type RagQueryStatus = "answered" | "no_results" | "failed";

export type RagQueryResult = {
  content: string;
  citations: RagCitation[];
  contexts: RagRetrievedContext[];
  status: RagQueryStatus;
  error: string | null;
};

export type RagStreamEvent =
  | { type: "text"; text: string }
  | { type: "citation"; citation: RagCitation }
  | { type: "done" }
  | { type: "error"; error: string };
