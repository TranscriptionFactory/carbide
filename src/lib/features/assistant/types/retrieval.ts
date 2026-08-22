// C3's retrieval contract. Declared here rather than in ports.ts because the
// stores layer rule bans importing anything whose basename is `ports.ts`, and
// the chat store carries readiness as view state. ports.ts imports these the
// same way it already imports AssistantSession from types/session.ts.

// Branded so the normalization step cannot be skipped. An unnormalized folder
// ("projects" rather than "projects/") does not throw on the retrieval side —
// it silently under-matches and quietly narrows the user's scope, which is a
// worse failure than a crash. Only to_retrieval_scope produces this type, so
// the precondition is enforced by the compiler rather than by convention.
// `notes` (C3 amendment, AU-050) is matched whole rather than by prefix, so it
// has no normalization step to skip and cannot under-match the way an
// unnormalized folder does. The brand is not thereby decorative: folders still
// carry the precondition it exists to enforce, and to_retrieval_scope remains
// the only producer of this type.
export type RetrievalScope = {
  folders?: string[];
  tags?: string[];
  bases?: string[];
  notes?: string[];
  readonly __brand: "RetrievalScope";
};

export type RetrievalRequest = {
  // Already rewritten and mention-stripped by the caller: rag is session-blind,
  // so no conversation-shaped value crosses this boundary.
  query: string;
  pinned_titles: string[];
  boost_paths: string[];
  scope?: RetrievalScope;
  limit?: number;
};

// `markdown` is the whole note; `sections` are the line ranges that matched.
// Slicing is a budget decision, so it belongs to assembly rather than retrieval.
export type RetrievedNote = {
  id: string;
  note_path: string;
  title: string;
  markdown: string;
  score: number;
  source_tag: string;
  sections: { start_line: number; end_line: number }[];
};

// Discriminated rather than thrown: RagScopeError is a rag class, and an
// exception crossing the port would make `assistant` name it. Retrieval reports
// facts; the assistant owns every user-facing string.
export type RetrievalOutcome =
  | { status: "hits"; pinned: RetrievedNote[]; retrieved: RetrievedNote[] }
  | { status: "empty" }
  | { status: "scope_filtered" }
  | { status: "no_vault" }
  | { status: "search_failed" }
  | { status: "scope_failed"; scope_label: string };

export type RetrievalReadiness =
  | { state: "checking" }
  | { state: "indexing"; embedded: number; total: number }
  | { state: "ready" }
  | { state: "unavailable"; reason: string };
