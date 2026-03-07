import { describe, expect, it } from "vitest";
import {
  find_matches,
  navigate_match,
  make_search_state,
} from "$lib/features/document/domain/pdf_search";
import type { PageText } from "$lib/features/document/domain/pdf_search";

const pages: PageText[] = [
  { page_num: 1, text: "The quick brown fox jumps over the lazy dog" },
  { page_num: 2, text: "Fox and dog are common animals. The fox is quick." },
  { page_num: 3, text: "Nothing relevant here." },
];

describe("find_matches", () => {
  it("finds a single match", () => {
    const matches = find_matches(pages, "brown");
    expect(matches).toHaveLength(1);
    const m = matches[0];
    expect(m?.page_num).toBe(1);
    expect(m?.length).toBe(5);
  });

  it("finds matches across pages", () => {
    const matches = find_matches(pages, "fox");
    expect(matches.length).toBeGreaterThanOrEqual(3);
    const page_nums = matches.map((m) => m.page_num);
    expect(page_nums).toContain(1);
    expect(page_nums).toContain(2);
  });

  it("is case-insensitive", () => {
    const lower = find_matches(pages, "fox");
    const upper = find_matches(pages, "FOX");
    const mixed = find_matches(pages, "FoX");
    expect(lower.length).toBe(upper.length);
    expect(lower.length).toBe(mixed.length);
  });

  it("finds multiple matches on same page", () => {
    const matches = find_matches(pages, "fox");
    const page2_matches = matches.filter((m) => m.page_num === 2);
    expect(page2_matches.length).toBe(2);
  });

  it("returns empty array for empty query", () => {
    expect(find_matches(pages, "")).toHaveLength(0);
  });

  it("returns empty array for no matches", () => {
    expect(find_matches(pages, "zzznomatch")).toHaveLength(0);
  });

  it("records correct text_offset", () => {
    const matches = find_matches(pages, "quick");
    const m = matches[0];
    const page = pages[0];
    expect(m?.text_offset).toBe(4);
    expect(
      page?.text.slice(
        m?.text_offset,
        (m?.text_offset ?? 0) + (m?.length ?? 0),
      ),
    ).toBe("quick");
  });

  it("handles overlapping queries gracefully (non-overlapping step)", () => {
    const overlapping: PageText[] = [{ page_num: 1, text: "aaa" }];
    const matches = find_matches(overlapping, "aa");
    expect(matches).toHaveLength(2);
  });
});

describe("navigate_match", () => {
  it("advances to next match", () => {
    const state = make_search_state(pages, "fox");
    const next = navigate_match(state, "next");
    expect(next.current_index).toBe(1);
  });

  it("wraps forward past last match", () => {
    const state = make_search_state(pages, "fox");
    let s = state;
    for (let i = 0; i < state.matches.length; i++)
      s = navigate_match(s, "next");
    expect(s.current_index).toBe(0);
  });

  it("goes to previous match", () => {
    const state = make_search_state(pages, "fox");
    const next = navigate_match(state, "next");
    const back = navigate_match(next, "prev");
    expect(back.current_index).toBe(0);
  });

  it("wraps backward past first match", () => {
    const state = make_search_state(pages, "fox");
    const back = navigate_match(state, "prev");
    expect(back.current_index).toBe(state.matches.length - 1);
  });

  it("returns unchanged state for no matches", () => {
    const state = make_search_state(pages, "zzznomatch");
    const next = navigate_match(state, "next");
    expect(next).toBe(state);
  });
});

describe("make_search_state", () => {
  it("starts at index 0", () => {
    const state = make_search_state(pages, "fox");
    expect(state.current_index).toBe(0);
  });

  it("stores the query", () => {
    const state = make_search_state(pages, "fox");
    expect(state.query).toBe("fox");
  });

  it("empty state for no results", () => {
    const state = make_search_state(pages, "zzznomatch");
    expect(state.matches).toHaveLength(0);
  });
});
