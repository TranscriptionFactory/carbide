import { describe, it, expect } from "vitest";

function dedupe_category_tokens(tokens: string[]): string[] {
  return [...new Set(tokens)];
}

function dedupe_filtered_tokens(tokens: string[], search: string): string[] {
  const query = search.toLowerCase();
  return [...new Set(tokens.filter((t) => t.toLowerCase().includes(query)))];
}

describe("css token reference dedupe", () => {
  it("collapses duplicate tokens within a category", () => {
    const tokens = ["--card", "--card-foreground", "--card", "--primary"];
    expect(dedupe_category_tokens(tokens)).toEqual([
      "--card",
      "--card-foreground",
      "--primary",
    ]);
  });

  it("leaves unique tokens untouched", () => {
    const tokens = ["--background", "--foreground", "--border"];
    expect(dedupe_category_tokens(tokens)).toEqual(tokens);
  });

  it("collapses duplicate matches under an active search filter", () => {
    const tokens = ["--card", "--card-foreground", "--card", "--primary"];
    expect(dedupe_filtered_tokens(tokens, "card")).toEqual([
      "--card",
      "--card-foreground",
    ]);
  });
});
