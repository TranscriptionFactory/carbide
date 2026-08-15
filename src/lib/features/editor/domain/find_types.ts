export type FindScope = "document" | "selection";

export interface FindRange {
  from: number;
  to: number;
}

export interface FindSelection extends FindRange {
  text: string;
}

// `range` is tracked whenever one was captured, so it keeps being mapped
// through document changes even while `scope` is "document" and it is not
// constraining anything. Turning the scope back on must not reuse stale
// positions.
export interface FindOptions {
  case_sensitive: boolean;
  whole_word: boolean;
  range?: FindRange;
  scope?: FindScope;
}

export interface FindMatchRange {
  from: number;
  to: number;
  text: string;
}

export interface FindMatchesUpdate {
  match_count: number;
  selected_index: number;
  range: FindRange | null;
}

export type FindMatchesListener = (update: FindMatchesUpdate) => void;

export const DEFAULT_FIND_OPTIONS: FindOptions = {
  case_sensitive: false,
  whole_word: false,
};
