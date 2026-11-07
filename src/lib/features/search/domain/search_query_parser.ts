import type { SearchQuery, SearchScope } from "$lib/shared/types/search";

const PATH_TOKEN = "path:";
const PATH_VALUE_AND_TEXT = /^(?:"([^"]*)"?|(\S*))\s*(.*)$/s;

const scope_tokens: Array<{ token: string; scope: SearchScope }> = [
  { token: "content:", scope: "content" },
  { token: "title:", scope: "title" },
];

function parse_path_operator(raw: string, remainder: string): SearchQuery {
  const [, quoted, bare, text = ""] =
    PATH_VALUE_AND_TEXT.exec(remainder.trim()) ?? [];
  const path_filter = (quoted ?? bare ?? "").trim();
  if (!path_filter) {
    return { raw, text, scope: "path", domain: "notes" };
  }
  return { raw, text, scope: "all", domain: "notes", path_filter };
}

export function parse_search_query(raw: string): SearchQuery {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { raw, text: "", scope: "all", domain: "notes" };
  }

  const lower = trimmed.toLowerCase();

  if (trimmed.startsWith(">")) {
    return {
      raw,
      text: trimmed.slice(1).trim(),
      scope: "all",
      domain: "commands",
    };
  }

  if (lower === "#planned" || lower.startsWith("#planned ")) {
    return {
      raw,
      text: trimmed.slice("#planned".length).trim(),
      scope: "all",
      domain: "planned",
    };
  }

  if (lower.startsWith(PATH_TOKEN)) {
    return parse_path_operator(raw, trimmed.slice(PATH_TOKEN.length));
  }

  for (const { token, scope } of scope_tokens) {
    if (lower.startsWith(token)) {
      return {
        raw,
        text: trimmed.slice(token.length).trim(),
        scope,
        domain: "notes",
      };
    }
  }

  return { raw, text: trimmed, scope: "all", domain: "notes" };
}
