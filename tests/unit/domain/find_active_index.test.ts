import { describe, expect, it } from "vitest";
import {
  next_active_index_after_replacement,
  normalize_active_index,
} from "$lib/features/editor/domain/find_active_index";
import type { FindMatchRange } from "$lib/features/editor/domain/find_types";

function ranges(...froms: number[]): FindMatchRange[] {
  return froms.map((from) => ({ from, to: from + 1, text: "x" }));
}

describe("normalize_active_index", () => {
  it("returns 0 for an empty match set", () => {
    expect(normalize_active_index(3, 0)).toBe(0);
  });

  it("clamps to the last valid index", () => {
    expect(normalize_active_index(9, 3)).toBe(2);
  });

  it("clamps negative indices to 0", () => {
    expect(normalize_active_index(-4, 3)).toBe(0);
  });

  it("falls back to 0 for non-finite input", () => {
    expect(normalize_active_index(Number.NaN, 3)).toBe(0);
  });
});

describe("next_active_index_after_replacement", () => {
  it("returns 0 when no matches remain", () => {
    expect(next_active_index_after_replacement([], 5, 3)).toBe(0);
  });

  it("selects the first match at or after the replacement end", () => {
    expect(next_active_index_after_replacement(ranges(0, 10, 20), 0, 5)).toBe(
      1,
    );
  });

  it("wraps to the first match when the replaced one was last", () => {
    expect(next_active_index_after_replacement(ranges(0, 10, 20), 20, 5)).toBe(
      0,
    );
  });

  it("skips matches that fall inside the replacement text, wrapping to 0", () => {
    expect(next_active_index_after_replacement(ranges(0, 4), 0, 10)).toBe(0);
  });
});
