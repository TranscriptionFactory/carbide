import { describe, it, expect } from "vitest";
import {
  sync_reference_to_frontmatter,
  remove_reference_from_frontmatter,
} from "$lib/features/reference/domain/frontmatter_sync";
import { make_item } from "./helpers";

describe("sync_reference_to_frontmatter", () => {
  it("adds a reference to empty frontmatter", () => {
    const item = make_item("smith2024", {
      title: "A Study",
      author: [{ family: "Smith", given: "John" }],
      issued: { "date-parts": [[2024]] },
      DOI: "10.1234/test",
      "container-title": "Nature",
    });
    const result = sync_reference_to_frontmatter("", item);
    expect(result).toContain("citekey: smith2024");
    expect(result).toContain("title: A Study");
    expect(result).toContain("authors: Smith, John");
    expect(result).toContain("year: 2024");
    expect(result).toContain("doi: 10.1234/test");
    expect(result).toContain("journal: Nature");
  });

  it("adds a reference preserving existing frontmatter keys", () => {
    const yaml = "title: My Note\ntags:\n  - research";
    const item = make_item("doe2023");
    const result = sync_reference_to_frontmatter(yaml, item);
    expect(result).toContain("title: My Note");
    expect(result).toContain("tags:");
    expect(result).toContain("- research");
    expect(result).toContain("citekey: doe2023");
  });

  it("is idempotent — adding same citekey updates metadata", () => {
    const item = make_item("smith2024", {
      title: "Original Title",
      author: [{ family: "Smith" }],
    });
    const first = sync_reference_to_frontmatter("", item);
    const updated = make_item("smith2024", {
      title: "Updated Title",
      author: [{ family: "Smith" }],
    });
    const second = sync_reference_to_frontmatter(first, updated);
    expect(second).toContain("Updated Title");
    expect(second).not.toContain("Original Title");
    const refs = second.match(/citekey: smith2024/g);
    expect(refs).toHaveLength(1);
  });

  it("appends to existing references array", () => {
    const item1 = make_item("smith2024");
    const first = sync_reference_to_frontmatter("", item1);
    const item2 = make_item("doe2023");
    const result = sync_reference_to_frontmatter(first, item2);
    expect(result).toContain("citekey: smith2024");
    expect(result).toContain("citekey: doe2023");
  });

  it("omits missing optional fields", () => {
    const item = { id: "bare2024", type: "article-journal" };
    const result = sync_reference_to_frontmatter("", item);
    expect(result).toContain("citekey: bare2024");
    expect(result).not.toContain("title:");
    expect(result).not.toContain("authors:");
    expect(result).not.toContain("year:");
    expect(result).not.toContain("doi:");
    expect(result).not.toContain("journal:");
  });

  it("handles literal author names", () => {
    const item = make_item("org2024", {
      author: [{ literal: "World Health Organization" }],
    });
    const result = sync_reference_to_frontmatter("", item);
    expect(result).toContain("authors: World Health Organization");
  });

  it("handles multiple authors", () => {
    const item = make_item("multi2024", {
      author: [
        { family: "Smith", given: "John" },
        { family: "Doe", given: "Jane" },
      ],
    });
    const result = sync_reference_to_frontmatter("", item);
    expect(result).toContain("authors: Smith, John; Doe, Jane");
  });
});

describe("remove_reference_from_frontmatter", () => {
  it("removes a reference by citekey", () => {
    const item = make_item("smith2024");
    const yaml = sync_reference_to_frontmatter("", item);
    const result = remove_reference_from_frontmatter(yaml, "smith2024");
    expect(result).not.toContain("smith2024");
    expect(result).not.toContain("references:");
  });

  it("leaves other references intact", () => {
    let yaml = sync_reference_to_frontmatter("", make_item("smith2024"));
    yaml = sync_reference_to_frontmatter(yaml, make_item("doe2023"));
    const result = remove_reference_from_frontmatter(yaml, "smith2024");
    expect(result).not.toContain("smith2024");
    expect(result).toContain("citekey: doe2023");
  });

  it("preserves other frontmatter keys when removing last reference", () => {
    const yaml = sync_reference_to_frontmatter(
      "title: My Note",
      make_item("smith2024"),
    );
    const result = remove_reference_from_frontmatter(yaml, "smith2024");
    expect(result).toContain("title: My Note");
    expect(result).not.toContain("references:");
  });

  it("is a no-op when citekey not found", () => {
    const yaml = sync_reference_to_frontmatter("", make_item("smith2024"));
    const result = remove_reference_from_frontmatter(yaml, "nonexistent");
    expect(result).toContain("citekey: smith2024");
  });

  it("returns original yaml when no references array exists", () => {
    const yaml = "title: My Note";
    const result = remove_reference_from_frontmatter(yaml, "smith2024");
    expect(result).toBe("title: My Note");
  });

  it("handles empty string frontmatter", () => {
    const result = remove_reference_from_frontmatter("", "smith2024");
    expect(result).toBe("");
  });
});
