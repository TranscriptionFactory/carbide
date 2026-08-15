import type { Mappable } from "prosemirror-transform";
import type {
  FindRange,
  FindScope,
  FindSelection,
  FindOptions,
} from "./find_types";

const MAX_SEEDED_QUERY_LENGTH = 100;

export interface FindOpenState {
  query: string | null;
  scope: FindScope;
  scope_range: FindRange | null;
}

function spans_multiple_lines(text: string): boolean {
  return text.includes("\n");
}

export function resolve_find_open_state(
  selection: FindSelection | null,
): FindOpenState {
  if (!selection || selection.text.length === 0) {
    return { query: null, scope: "document", scope_range: null };
  }

  if (spans_multiple_lines(selection.text)) {
    return {
      query: null,
      scope: "selection",
      scope_range: { from: selection.from, to: selection.to },
    };
  }

  const query =
    selection.text.length <= MAX_SEEDED_QUERY_LENGTH ? selection.text : null;
  return { query, scope: "document", scope_range: null };
}

// Both ends bias away from inserted text, so a character typed against either
// edge lands outside the scope: a range that grew at its boundaries would
// quietly start matching prose the user never selected.
export function map_find_range(
  range: FindRange,
  mapping: Mappable,
): FindRange | null {
  const from = mapping.map(range.from, 1);
  const to = mapping.map(range.to, -1);
  return to > from ? { from, to } : null;
}

export function map_find_options(
  options: FindOptions,
  mapping: Mappable,
): FindOptions {
  if (!options.range) return options;

  const range = map_find_range(options.range, mapping);
  if (range) return { ...options, range };

  const { range: _collapsed, ...without_range } = options;
  return without_range;
}
