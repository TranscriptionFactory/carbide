import type {
  DslContext,
  DslSuggestResult,
  DslSuggestion,
} from "$lib/shared/types/dsl_suggestion";
import { suggest_query } from "$lib/features/query";
import { VIEW_MODES } from "$lib/features/bases";

const KEYS = ["view", "query", "group_by", "date_property"];

function line_bounds(text: string): { start: number; line: string } {
  const start = text.lastIndexOf("\n") + 1;
  return { start, line: text.slice(start) };
}

function filter_prefix(
  values: string[],
  partial: string,
  wrap: (v: string) => string,
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

export function suggest_base_spec(
  text_before_cursor: string,
  ctx: DslContext,
): DslSuggestResult {
  const { start, line } = line_bounds(text_before_cursor);
  const colon = line.indexOf(":");

  if (colon === -1) {
    const partial = line.replace(/^\s*/, "");
    const from = start + (line.length - partial.length);
    return {
      from,
      items: filter_prefix(KEYS, partial, (v) => `${v}: `, "field"),
    };
  }

  const key = line.slice(0, colon).trim().toLowerCase();
  const value_start = start + colon + 1;
  const raw_value = text_before_cursor.slice(value_start);
  const value_offset = raw_value.length - raw_value.trimStart().length;
  const from_base = value_start + value_offset;
  const partial = raw_value.trimStart();

  if (key === "query") {
    const inner = suggest_query(partial, ctx);
    return { from: from_base + inner.from, items: inner.items };
  }

  if (key === "view") {
    return {
      from: from_base,
      items: filter_prefix([...VIEW_MODES], partial, (v) => v, "view mode"),
    };
  }

  if (key === "group_by" || key === "date_property") {
    return {
      from: from_base,
      items: filter_prefix(ctx.property_names ?? [], partial, (v) => v, "property"),
    };
  }

  return { from: from_base, items: [] };
}
