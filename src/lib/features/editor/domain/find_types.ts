export interface FindOptions {
  case_sensitive: boolean;
  whole_word: boolean;
}

export interface FindMatchRange {
  from: number;
  to: number;
  text: string;
}

export interface FindMatchesUpdate {
  match_count: number;
  selected_index: number;
}

export type FindMatchesListener = (update: FindMatchesUpdate) => void;

export const DEFAULT_FIND_OPTIONS: FindOptions = {
  case_sensitive: false,
  whole_word: false,
};
