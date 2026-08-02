// Rag's own copy of the retrieval contract. Declared structurally rather than
// imported: the assistant slice declares the port, the DI root builds an object
// literal over this service, and rag never names the assistant's types. Same
// arrangement as RagReadiness alongside RetrievalReadiness.

// Values arrive normalized — the composer canonicalizes them via
// to_retrieval_scope, whose branded return type is the compiler-enforced
// precondition. Folder prefixes therefore already carry their trailing slash,
// which is why matching here is a bare startsWith.
// `notes` holds whole note paths and is matched exactly, which is why it needs
// no counterpart to the folder normalization above.
export type RetrievalScope = {
  folders?: string[];
  tags?: string[];
  bases?: string[];
  notes?: string[];
};

export type RetrievalRequest = {
  query: string;
  pinned_titles: string[];
  boost_paths: string[];
  scope?: RetrievalScope;
  limit?: number;
};

export type RetrievedNote = {
  id: string;
  note_path: string;
  title: string;
  markdown: string;
  score: number;
  source_tag: string;
  section: { start_line: number; end_line: number } | null;
};

export type RetrievalOutcome =
  | { status: "hits"; pinned: RetrievedNote[]; retrieved: RetrievedNote[] }
  | { status: "empty" }
  | { status: "scope_filtered" }
  | { status: "no_vault" }
  | { status: "search_failed" }
  | { status: "scope_failed"; scope_label: string };
