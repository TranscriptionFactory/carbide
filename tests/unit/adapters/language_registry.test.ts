import { describe, it, expect } from "vitest";
import {
  find_language_label,
  search_languages,
  POPULAR_LANGUAGES,
  ALL_LANGUAGES,
} from "$lib/features/editor/adapters/language_registry";

describe("find_language_label", () => {
  it("returns label for a popular language", () => {
    expect(find_language_label("javascript")).toBe("JavaScript");
    expect(find_language_label("typescript")).toBe("TypeScript");
    expect(find_language_label("rust")).toBe("Rust");
  });

  it("returns label for a non-popular language", () => {
    expect(find_language_label("haskell")).toBe("Haskell");
    expect(find_language_label("elixir")).toBe("Elixir");
  });

  it('returns "Plain Text" for empty string', () => {
    expect(find_language_label("")).toBe("Plain Text");
  });

  it("returns the id itself for unknown languages", () => {
    expect(find_language_label("unknown_lang")).toBe("unknown_lang");
  });
});

describe("search_languages", () => {
  it("returns all languages for empty query", () => {
    const result = search_languages("");
    expect(result.popular).toEqual(POPULAR_LANGUAGES);
    expect(result.all).toEqual(ALL_LANGUAGES);
  });

  it("filters by id substring", () => {
    const result = search_languages("type");
    expect(result.popular.some((l) => l.id === "typescript")).toBe(true);
    expect(
      result.popular.every(
        (l) => l.id.includes("type") || l.label.toLowerCase().includes("type"),
      ),
    ).toBe(true);
  });

  it("filters by label substring case-insensitively", () => {
    const result = search_languages("Java");
    expect(result.popular.some((l) => l.id === "java")).toBe(true);
    expect(result.popular.some((l) => l.id === "javascript")).toBe(true);
  });

  it("returns empty arrays when nothing matches", () => {
    const result = search_languages("xyznonexistent");
    expect(result.popular).toHaveLength(0);
    expect(result.all).toHaveLength(0);
  });
});

describe("language lists", () => {
  it("ALL_LANGUAGES is sorted alphabetically", () => {
    const labels = ALL_LANGUAGES.map((l) => l.label);
    const sorted = [...labels].sort((a, b) => a.localeCompare(b));
    expect(labels).toEqual(sorted);
  });

  it("POPULAR_LANGUAGES contains common languages", () => {
    const ids = POPULAR_LANGUAGES.map((l) => l.id);
    expect(ids).toContain("javascript");
    expect(ids).toContain("python");
    expect(ids).toContain("rust");
    expect(ids).toContain("mermaid");
  });
});
