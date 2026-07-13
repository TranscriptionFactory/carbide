import type {
  DslContext,
  DslSuggestResult,
  DslSuggestion,
} from "$lib/shared/types/dsl_suggestion";
import { CLAUSE_KEYWORDS, FORMS, PROPERTY_OPERATORS } from "./query_parser";

const FORM_WORDS = Object.keys(FORMS);
const CLAUSE_WORDS = Object.keys(CLAUSE_KEYWORDS);
const JOIN_WORDS = ["and", "or"];
const CLAUSE_STARTERS = [...CLAUSE_WORDS, "linked from", "not", "("];

interface ScanState {
  open_braces: number[];
  open_parens: number;
  open_wikilink: number | null;
  open_quote: { pos: number; quote: string; clause: string | null } | null;
  clause: string | null;
  token_start: number;
}

function scan(text: string): ScanState {
  const open_braces: number[] = [];
  let open_parens = 0;
  let open_wikilink: number | null = null;
  let open_quote: ScanState["open_quote"] = null;
  let clause: string | null = null;
  let token_start = 0;
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;

    if (open_quote) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === open_quote.quote) {
        open_quote = null;
        token_start = i + 1;
      }
      i++;
      continue;
    }

    if (open_wikilink !== null) {
      if (ch === "]" && text[i + 1] === "]") {
        open_wikilink = null;
        i += 2;
        token_start = i;
        continue;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      open_quote = { pos: i, quote: ch, clause };
      i++;
      continue;
    }
    if (ch === "[" && text[i + 1] === "[") {
      open_wikilink = i;
      i += 2;
      continue;
    }
    if (ch === "{") {
      open_braces.push(i);
      i++;
      token_start = i;
      continue;
    }
    if (ch === "}") {
      open_braces.pop();
      i++;
      token_start = i;
      continue;
    }
    if (ch === "(") {
      open_parens++;
      i++;
      token_start = i;
      continue;
    }
    if (ch === ")") {
      if (open_parens > 0) open_parens--;
      i++;
      token_start = i;
      continue;
    }

    if (/\s/.test(ch)) {
      const word = text.slice(token_start, i).toLowerCase();
      if (CLAUSE_KEYWORDS[word] || word === "linked") clause = word;
      else if (JOIN_WORDS.includes(word) || word === "not") clause = null;
      i++;
      token_start = i;
      continue;
    }

    i++;
  }

  return {
    open_braces,
    open_parens,
    open_wikilink,
    open_quote,
    clause,
    token_start,
  };
}

function items_from(
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

function keyword_items(
  words: string[],
  partial: string,
  detail?: string,
): DslSuggestion[] {
  const lower = partial.toLowerCase();
  return words
    .filter((w) => w.toLowerCase().startsWith(lower))
    .map((w) =>
      detail === undefined
        ? { label: w, insert: w }
        : { label: w, insert: w, detail },
    );
}

function unbalanced_closers(state: ScanState): DslSuggestion[] {
  const closers: DslSuggestion[] = [];
  if (state.open_parens > 0) {
    closers.push({ label: ")", insert: ")", detail: "close group" });
  }
  if (state.open_braces.length > 0) {
    closers.push({ label: "}", insert: "}", detail: "close subquery" });
  }
  return closers;
}

export function suggest_query(
  text_before_cursor: string,
  ctx: DslContext,
): DslSuggestResult {
  const state = scan(text_before_cursor);

  if (state.open_braces.length > 0) {
    const brace_pos = state.open_braces[state.open_braces.length - 1]!;
    const tail = text_before_cursor.slice(brace_pos + 1);
    const inner = suggest_query(tail, ctx);
    const at_connective = inner.items.some((i) => i.label === "and");
    const items = at_connective
      ? [...inner.items, { label: "}", insert: "}", detail: "close subquery" }]
      : inner.items;
    return { from: brace_pos + 1 + inner.from, items };
  }

  if (state.open_wikilink !== null) {
    const from = state.open_wikilink + 2;
    const partial = text_before_cursor.slice(from);
    return {
      from,
      items: items_from(ctx.note_names ?? [], partial, (v) => `${v}]]`, "note"),
    };
  }

  if (state.open_quote) {
    const from = state.open_quote.pos + 1;
    const partial = text_before_cursor.slice(from);
    const q = state.open_quote.quote;
    if (state.open_quote.clause === "in") {
      return {
        from,
        items: items_from(
          ctx.folder_paths ?? [],
          partial,
          (v) => `${v}${q}`,
          "folder",
        ),
      };
    }
    return {
      from,
      items: items_from(
        ctx.note_names ?? [],
        partial,
        (v) => `${v}${q}`,
        "note",
      ),
    };
  }

  const from = state.token_start;
  const partial = text_before_cursor.slice(from);

  if (partial.startsWith("#")) {
    const tag_partial = partial.slice(1);
    return {
      from,
      items: items_from(ctx.tags ?? [], tag_partial, (v) => `#${v}`, "tag"),
    };
  }

  const prefix = text_before_cursor.slice(0, from);
  const prev_word = last_word(prefix);
  const items = positional_items(prev_word, partial, state, ctx);
  return { from, items };
}

function last_word(text: string): string {
  const trimmed = text.trimEnd();
  const match = /(\S+)$/.exec(trimmed);
  return match ? match[1]! : "";
}

function positional_items(
  prev_word: string,
  partial: string,
  state: ScanState,
  ctx: DslContext,
): DslSuggestion[] {
  const lower = prev_word.toLowerCase();
  const closers = unbalanced_closers(state);

  if (prev_word === "") {
    return keyword_items(FORM_WORDS, partial, "form");
  }

  if (
    FORMS[lower] ||
    JOIN_WORDS.includes(lower) ||
    lower === "not" ||
    prev_word === "("
  ) {
    return keyword_items(CLAUSE_STARTERS, partial, "clause");
  }

  if (lower === "named") {
    return [
      ...keyword_items(['"', "/"], partial, "name / regex"),
      ...items_from(ctx.note_names ?? [], partial, (v) => `"${v}"`, "note"),
    ];
  }

  if (lower === "with") {
    return [
      ...items_from(ctx.tags ?? [], partial, (v) => `#${v}`, "tag"),
      ...keyword_items(ctx.property_names ?? [], partial, "property"),
    ];
  }

  if (lower === "in") {
    return [
      ...keyword_items(['"', "[["], partial, "folder"),
      ...items_from(ctx.folder_paths ?? [], partial, (v) => `"${v}"`, "folder"),
    ];
  }

  if (lower === "linked") {
    return keyword_items(["from"], partial, "linked from");
  }

  if (lower === "from" && prev_is_linked_from(state)) {
    return items_from(ctx.note_names ?? [], partial, (v) => `[[${v}]]`, "note");
  }

  if (
    state.clause === "with" &&
    ctx.property_names?.some((p) => p.toLowerCase() === lower)
  ) {
    return keyword_items(PROPERTY_OPERATORS, partial, "operator");
  }

  return [...keyword_items(JOIN_WORDS, partial, "join"), ...closers];
}

function prev_is_linked_from(state: ScanState): boolean {
  return state.clause === "linked";
}
