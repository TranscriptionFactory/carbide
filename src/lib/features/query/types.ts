import type { NoteMeta } from "$lib/shared/types/note";

export type QueryForm = "notes" | "sections";

export type ClauseType =
  | "named"
  | "with"
  | "in"
  | "under"
  | "linked_from"
  | "with_property";

export type JoinOp = "and" | "or";

export type ValueKind =
  | { kind: "text"; value: string }
  | { kind: "regex"; pattern: string; flags: string }
  | { kind: "wikilink"; target: string }
  | { kind: "tag"; tag: string }
  | { kind: "subquery"; query: QueryNode };

export type QueryClause = {
  kind: "clause";
  type: ClauseType;
  negated: boolean;
  value: ValueKind;
  property_name?: string;
  property_operator?: string;
};

export type ClauseGroup = {
  kind: "group";
  join: JoinOp;
  clauses: QueryNode[];
};

export type QueryNode = QueryClause | ClauseGroup;

export type ParsedQuery = {
  form: QueryForm;
  root: QueryNode;
};

// The section a `sections` result row points at. Absent on `notes` results,
// which stay note-level and shape-identical to before.
export type QuerySection = {
  heading_id: string;
  title: string;
  level: number;
  heading_path: string;
  start_line: number;
  end_line: number;
  word_count: number;
};

export type QueryResultItem = {
  note: NoteMeta;
  matched_clauses: string[];
  section?: QuerySection;
};

export type QueryResult = {
  items: QueryResultItem[];
  total: number;
  elapsed_ms: number;
  query_text: string;
};

export type QueryError = {
  message: string;
  position: number;
  length: number;
};

export type ParseResult =
  | { ok: true; query: ParsedQuery }
  | { ok: false; error: QueryError };

export type SavedQueryMeta = {
  path: string;
  name: string;
  mtime_ms: number;
  size_bytes: number;
};

// A section row is identified by its note and heading; a note-level row keys on
// the note alone, which is what every `notes` query keys on.
export function result_item_key(item: QueryResultItem): string {
  return item.section
    ? `${item.note.path}\u0000${item.section.heading_id}`
    : item.note.path;
}
