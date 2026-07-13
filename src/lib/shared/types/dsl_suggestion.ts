export interface DslSuggestion {
  label: string;
  insert: string;
  detail?: string;
}

export interface DslSuggestResult {
  from: number;
  items: DslSuggestion[];
}

export interface DslContext {
  tags?: string[];
  note_names?: string[];
  folder_paths?: string[];
  property_names?: string[];
}

export type DslSuggestProvider = (
  text_before_cursor: string,
  ctx: DslContext,
) => DslSuggestResult;
