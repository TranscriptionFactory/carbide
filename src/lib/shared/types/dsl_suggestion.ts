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

export function filter_dsl_suggestions(
  values: string[],
  partial: string,
  wrap: (v: string) => string = (v) => v,
  detail?: string,
): DslSuggestion[] {
  const lower = partial.toLowerCase();
  return values
    .filter((v) => v.toLowerCase().startsWith(lower))
    .map((v) =>
      detail === undefined
        ? { label: v, insert: wrap(v) }
        : { label: v, insert: wrap(v), detail },
    );
}
