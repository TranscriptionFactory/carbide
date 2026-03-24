import { describe, it, expect } from "vitest";
import {
  format_authors,
  extract_year,
  generate_citekey,
  match_query,
} from "$lib/features/reference/domain/csl_utils";
import type { CslItem } from "$lib/features/reference/types";

function make_item(overrides: Partial<CslItem> = {}): CslItem {
  return {
    id: "smith2024",
    type: "article-journal",
    title: "A Study of Things",
    author: [{ family: "Smith", given: "John" }],
    issued: { "date-parts": [[2024]] },
    ...overrides,
  };
}

describe("format_authors", () => {
  it("formats family, given name", () => {
    expect(format_authors([{ family: "Smith", given: "John" }])).toBe(
      "Smith, John",
    );
  });

  it("uses literal name when provided", () => {
    expect(format_authors([{ literal: "WHO" }])).toBe("WHO");
  });

  it("joins multiple authors with semicolons", () => {
    const authors = [
      { family: "Smith", given: "J" },
      { family: "Doe", given: "A" },
    ];
    expect(format_authors(authors)).toBe("Smith, J; Doe, A");
  });

  it("returns empty string for undefined", () => {
    expect(format_authors(undefined)).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(format_authors([])).toBe("");
  });
});

describe("extract_year", () => {
  it("extracts year from date-parts", () => {
    expect(extract_year(make_item())).toBe(2024);
  });

  it("extracts year from literal date", () => {
    const item = make_item({ issued: { literal: "circa 1999" } });
    expect(extract_year(item)).toBe(1999);
  });

  it("returns null when no issued date", () => {
    const item = make_item({ issued: undefined });
    expect(extract_year(item)).toBeNull();
  });

  it("returns null for empty date-parts", () => {
    const item = make_item({ issued: { "date-parts": [] } });
    expect(extract_year(item)).toBeNull();
  });
});

describe("generate_citekey", () => {
  it("generates citekey from family name and year", () => {
    expect(generate_citekey(make_item())).toBe("smith2024");
  });

  it("uses 'nd' when no year is available", () => {
    const item = make_item({ issued: undefined });
    expect(generate_citekey(item)).toBe("smithnd");
  });

  it("uses literal name if no family name", () => {
    const item = make_item({ author: [{ literal: "WHO" }] });
    expect(generate_citekey(item)).toBe("who2024");
  });

  it("uses 'unknown' when no author", () => {
    const item = make_item({ author: undefined });
    expect(generate_citekey(item)).toBe("unknown2024");
  });

  it("strips non-alphanumeric chars from family name", () => {
    const item = make_item({ author: [{ family: "O'Brien-Smith" }] });
    expect(generate_citekey(item)).toBe("obriensmith2024");
  });
});

describe("match_query", () => {
  it("matches by citekey", () => {
    expect(match_query(make_item(), "smith2024")).toBe(true);
  });

  it("matches by title substring", () => {
    expect(match_query(make_item(), "study")).toBe(true);
  });

  it("matches by author name", () => {
    expect(match_query(make_item(), "smith")).toBe(true);
  });

  it("matches by year", () => {
    expect(match_query(make_item(), "2024")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(match_query(make_item(), "SMITH")).toBe(true);
  });

  it("returns false for non-matching query", () => {
    expect(match_query(make_item(), "nonexistent")).toBe(false);
  });
});
