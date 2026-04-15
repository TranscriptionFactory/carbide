import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";

describe("frontmatter roundtrip", () => {
  it("preserves frontmatter with short body", () => {
    const input = "---\ntitle: Hello\ntags: [a]\n---\n\nOne line.";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc);
    expect(output).toContain("---");
    expect(output).toContain("title: Hello");
    expect(output).toContain("tags: [a]");
    expect(output).toContain("One line.");
  });

  it("preserves frontmatter with empty body", () => {
    const input = "---\ntitle: Test\n---";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc);
    expect(output).toContain("---");
    expect(output).toContain("title: Test");
  });

  it("preserves frontmatter-only doc", () => {
    const input = "---\ndate: 2024-01-01\n---";
    const doc = parse_markdown(input);
    expect(doc.firstChild?.type.name).toBe("frontmatter");
    const output = serialize_markdown(doc);
    expect(output).toContain("date: 2024-01-01");
    expect(output).toContain("---");
  });

  it("preserves frontmatter with multi-line body", () => {
    const input = "---\nid: 1\n---\n\nLine one.\n\nLine two.";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc);
    expect(output).toContain("id: 1");
    expect(output).toContain("Line one.");
    expect(output).toContain("Line two.");
  });
});
