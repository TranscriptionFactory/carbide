import type {
  DslContext,
  DslSuggestion,
  DslSuggestResult,
} from "$lib/shared/types/dsl_suggestion";
import {
  GROUPABLE_PROPS,
  SORTABLE_PROPS,
} from "$lib/features/task/parse_task_query";

const CLAUSE_STARTERS = [
  "is",
  "not",
  "done",
  "status",
  "path",
  "section",
  "text",
  "tag",
  "due",
  "has",
  "no",
  "sort",
  "group",
  "limit",
  "(",
  "NOT",
];

const STATUSES = ["todo", "doing", "done"];
const DUE_STARTERS = [
  "before",
  "after",
  "on",
  "today",
  "this week",
  "last week",
  "next 7 days",
];
const CONNECTIVES = ["AND", "OR", "NOT", "("];

function plain(labels: string[]): DslSuggestion[] {
  return labels.map((label) => ({ label, insert: label }));
}

function follow_set(tokens: string[], ctx: DslContext): DslSuggestion[] {
  if (tokens.length === 0) return plain(CLAUSE_STARTERS);

  const head = tokens[0]!.toLowerCase();

  if (tokens.length === 1) {
    switch (head) {
      case "is":
        return plain(STATUSES);
      case "not":
        return plain(["done"]);
      case "path":
      case "section":
      case "text":
        return plain(["includes"]);
      case "tag":
        return plain(["includes"]);
      case "due":
        return plain(DUE_STARTERS);
      case "has":
        return plain(["due date", "tag"]);
      case "no":
        return plain(["due date"]);
      case "sort":
      case "group":
        return plain(["by"]);
    }
  }

  if (tokens.length === 2) {
    const second = tokens[1]!.toLowerCase();
    if (head === "tag" && second === "includes") {
      return (ctx.tags ?? []).map((t) => {
        const label = t.startsWith("#") ? t : `#${t}`;
        return { label, insert: label };
      });
    }
    if (head === "sort" && second === "by") {
      return plain([...SORTABLE_PROPS]);
    }
    if (head === "group" && second === "by") {
      return plain([...GROUPABLE_PROPS]);
    }
  }

  return plain(CONNECTIVES);
}

export function suggest_task_query(
  text_before_cursor: string,
  ctx: DslContext,
): DslSuggestResult {
  const line_start = text_before_cursor.lastIndexOf("\n") + 1;
  const line = text_before_cursor.slice(line_start);

  if (/(?:^|\s)#\s/.test(line))
    return { from: text_before_cursor.length, items: [] };

  const at_word_boundary = line === "" || /\s$/.test(line);
  const partial = at_word_boundary ? "" : (line.match(/\S+$/)?.[0] ?? "");
  const token_col = line.length - partial.length;
  const from = line_start + token_col;

  const completed = line.slice(0, token_col).trim();
  const tokens = completed === "" ? [] : completed.split(/\s+/);

  const items = follow_set(tokens, ctx).filter((s) =>
    s.label.toLowerCase().startsWith(partial.toLowerCase()),
  );

  return { from, items };
}
