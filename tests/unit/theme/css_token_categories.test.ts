import { describe, it, expect } from "vitest";
import {
  CATEGORIES,
  dedupe_category_tokens,
  type TokenCategory,
} from "$lib/features/settings/ui/theme/css_token_categories";

describe("css token categories", () => {
  it("collapses duplicate tokens within a category, keeping first occurrence", () => {
    const categories: TokenCategory[] = [
      {
        label: "Colors",
        tokens: ["--card", "--card-foreground", "--card", "--primary"],
      },
    ];
    expect(dedupe_category_tokens(categories)).toEqual([
      {
        label: "Colors",
        tokens: ["--card", "--card-foreground", "--primary"],
      },
    ]);
  });

  it("leaves categories with unique tokens untouched", () => {
    const categories: TokenCategory[] = [
      { label: "Colors", tokens: ["--background", "--foreground"] },
      { label: "Status", tokens: ["--indicator-dirty"] },
    ];
    expect(dedupe_category_tokens(categories)).toEqual(categories);
  });

  it("exports CATEGORIES deduped per category", () => {
    for (const cat of CATEGORIES) {
      expect(new Set(cat.tokens).size).toBe(cat.tokens.length);
    }
  });

  it("has no duplicate category labels", () => {
    const labels = CATEGORIES.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
