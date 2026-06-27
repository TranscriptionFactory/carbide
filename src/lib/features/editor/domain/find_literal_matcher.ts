import type { Node as ProseNode } from "prosemirror-model";
import type { FindMatchRange, FindOptions } from "./find_types";

interface TextMatchRange {
  start: number;
  end: number;
  text: string;
}

const ASCII_WORD_RE = /[A-Za-z0-9_]/;

function is_ascii_word_char(char: string | undefined): boolean {
  return char !== undefined && ASCII_WORD_RE.test(char);
}

function is_whole_word_match(
  text: string,
  start: number,
  end: number,
): boolean {
  return !is_ascii_word_char(text[start - 1]) && !is_ascii_word_char(text[end]);
}

export function find_literal_matches_in_text(
  text: string,
  query: string,
  options: FindOptions,
): TextMatchRange[] {
  if (query.length === 0) return [];

  const haystack = options.case_sensitive ? text : text.toLocaleLowerCase();
  const needle = options.case_sensitive ? query : query.toLocaleLowerCase();
  const matches: TextMatchRange[] = [];

  let search_from = 0;
  while (search_from <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, search_from);
    if (index === -1) break;

    const end = index + needle.length;
    if (!options.whole_word || is_whole_word_match(text, index, end)) {
      matches.push({ start: index, end, text: text.slice(index, end) });
    }
    search_from = end;
  }

  return matches;
}

export function find_literal_matches_in_doc(
  doc: ProseNode,
  query: string,
  options: FindOptions,
): FindMatchRange[] {
  if (query.length === 0) return [];

  const matches: FindMatchRange[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || typeof node.text !== "string") return;
    for (const match of find_literal_matches_in_text(
      node.text,
      query,
      options,
    )) {
      matches.push({
        from: pos + match.start,
        to: pos + match.end,
        text: match.text,
      });
    }
  });
  return matches;
}
