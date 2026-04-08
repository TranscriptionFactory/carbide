import { describe, expect, it } from "vitest";
import { extract_metadata } from "$lib/features/metadata/domain/extract_metadata";

describe("extract_metadata", () => {
  it("extracts properties from YAML frontmatter", () => {
    const md = "---\ntitle: Hello World\ndate: 2026-01-01\n---\n# Content";
    const result = extract_metadata(md);

    expect(result.properties).toEqual([
      { key: "title", value: "Hello World", type: "string" },
      { key: "date", value: "2026-01-01", type: "date" },
    ]);
  });

  it("extracts frontmatter tags as NoteTag with source frontmatter", () => {
    const md = "---\ntags:\n  - alpha\n  - beta\n---\n# Content";
    const result = extract_metadata(md);

    expect(result.tags).toEqual([
      { tag: "alpha", source: "frontmatter" },
      { tag: "beta", source: "frontmatter" },
    ]);
    expect(result.properties).toEqual([]);
  });

  it("extracts inline #tags from body text", () => {
    const md = "# Title\n\nSome text with #todo and #project/sub here.";
    const result = extract_metadata(md);

    expect(result.tags).toEqual([
      { tag: "todo", source: "inline" },
      { tag: "project/sub", source: "inline" },
    ]);
  });

  it("deduplicates tags across frontmatter and inline", () => {
    const md = "---\ntags:\n  - shared\n---\nBody #shared and #unique.";
    const result = extract_metadata(md);

    expect(result.tags).toEqual([
      { tag: "shared", source: "frontmatter" },
      { tag: "unique", source: "inline" },
    ]);
  });

  it("handles non-string frontmatter values as JSON", () => {
    const md = "---\ncount: 42\nenabled: true\nitems:\n  - a\n  - b\n---\n";
    const result = extract_metadata(md);

    const count = result.properties.find((p) => p.key === "count");
    const enabled = result.properties.find((p) => p.key === "enabled");
    const items = result.properties.find((p) => p.key === "items");

    expect(count).toEqual({ key: "count", value: "42", type: "number" });
    expect(enabled).toEqual({ key: "enabled", value: "true", type: "boolean" });
    expect(items?.type).toBe("tags");
  });

  it("returns empty metadata for markdown without frontmatter", () => {
    const md = "# Just a heading\n\nSome text.";
    const result = extract_metadata(md);

    expect(result.properties).toEqual([]);
    expect(result.tags).toEqual([]);
  });

  it("handles malformed YAML gracefully", () => {
    const md = "---\n[not: valid: yaml:\n---\n# Content";
    const result = extract_metadata(md);

    expect(result.properties).toEqual([]);
    expect(result.tags).toEqual([]);
  });

  it("strips # prefix from frontmatter tags", () => {
    const md = '---\ntags:\n  - "#read"\n  - plain\n---\n# Content';
    const result = extract_metadata(md);

    expect(result.tags).toEqual([
      { tag: "read", source: "frontmatter" },
      { tag: "plain", source: "frontmatter" },
    ]);
  });

  it("deduplicates frontmatter #tag with inline tag of same name", () => {
    const md = '---\ntags:\n  - "#shared"\n---\nBody #shared here.';
    const result = extract_metadata(md);

    expect(result.tags).toEqual([{ tag: "shared", source: "frontmatter" }]);
  });

  it("does not treat headings as inline tags", () => {
    const md = "# Heading\n## SubHeading\nBody text.";
    const result = extract_metadata(md);

    expect(result.tags).toEqual([]);
  });
});
