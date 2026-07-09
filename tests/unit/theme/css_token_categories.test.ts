import { describe, it, expect } from "vitest";
import { CATEGORIES } from "$lib/features/settings/ui/theme/css_token_categories";

describe("css token categories", () => {
  it("has no duplicate tokens within a category", () => {
    for (const cat of CATEGORIES) {
      const dupes = cat.tokens.filter((t, i) => cat.tokens.indexOf(t) !== i);
      expect(dupes, `duplicates in "${cat.label}"`).toEqual([]);
    }
  });

  it("has no duplicate category labels", () => {
    const labels = CATEGORIES.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
