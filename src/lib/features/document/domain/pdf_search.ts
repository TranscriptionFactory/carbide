export interface PageText {
  page_num: number;
  text: string;
}

export interface SearchMatch {
  page_num: number;
  text_offset: number;
  length: number;
}

export interface SearchState {
  query: string;
  matches: SearchMatch[];
  current_index: number;
}

export function find_matches(pages: PageText[], query: string): SearchMatch[] {
  if (!query) return [];

  const lower_query = query.toLowerCase();
  const matches: SearchMatch[] = [];

  for (const { page_num, text } of pages) {
    const lower_text = text.toLowerCase();
    let offset = 0;

    while (offset < lower_text.length) {
      const idx = lower_text.indexOf(lower_query, offset);
      if (idx === -1) break;
      matches.push({ page_num, text_offset: idx, length: query.length });
      offset = idx + 1;
    }
  }

  return matches;
}

export function navigate_match(
  state: SearchState,
  direction: "next" | "prev",
): SearchState {
  if (state.matches.length === 0) return state;

  const count = state.matches.length;
  const next_index =
    direction === "next"
      ? (state.current_index + 1) % count
      : (state.current_index - 1 + count) % count;

  return { ...state, current_index: next_index };
}

export function make_search_state(
  pages: PageText[],
  query: string,
): SearchState {
  const matches = find_matches(pages, query);
  return { query, matches, current_index: 0 };
}
