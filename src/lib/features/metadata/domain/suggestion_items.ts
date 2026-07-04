import type { KeySuggestion } from "../types";

export type KeySuggestionItem = {
  value: string;
  hint: string;
  description: string | null;
  indices: number[];
};

export function key_suggestion_items(
  suggestions: KeySuggestion[],
): KeySuggestionItem[] {
  return suggestions.map((s) => ({
    value: s.key,
    hint: s.type,
    description:
      s.description ??
      (s.count !== null
        ? `used in ${s.count} ${s.count === 1 ? "note" : "notes"}`
        : null),
    indices: s.indices,
  }));
}
