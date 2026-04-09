import { describe, expect, it } from "vitest";
import {
  parse_frontmatter,
  find_frontmatter_span,
  rebuild_frontmatter,
} from "$lib/shared/domain/frontmatter_parser";

describe("parse_frontmatter", () => {
  it("parses standard frontmatter", () => {
    const result = parse_frontmatter("---\ntitle: Test\n---\nBody");
    expect(result.has_frontmatter).toBe(true);
    expect(result.yaml).toBe("title: Test");
    expect(result.body).toBe("Body");
  });

  it("returns no frontmatter for plain text", () => {
    const result = parse_frontmatter("Just body text");
    expect(result.has_frontmatter).toBe(false);
    expect(result.yaml).toBe("");
    expect(result.body).toBe("Just body text");
  });

  it("handles empty frontmatter", () => {
    const result = parse_frontmatter("---\n---\nBody");
    expect(result.has_frontmatter).toBe(true);
    expect(result.yaml).toBe("");
    expect(result.body).toBe("Body");
  });

  it("handles empty document", () => {
    const result = parse_frontmatter("");
    expect(result.has_frontmatter).toBe(false);
    expect(result.body).toBe("");
  });

  it("handles --- only (no closing fence)", () => {
    const result = parse_frontmatter("---\ntitle: Test\n");
    expect(result.has_frontmatter).toBe(false);
    expect(result.body).toBe("---\ntitle: Test\n");
  });

  it("handles ---\\n--- with no body", () => {
    const result = parse_frontmatter("---\n---\n");
    expect(result.has_frontmatter).toBe(true);
    expect(result.yaml).toBe("");
    expect(result.body).toBe("");
  });

  it("handles trailing whitespace on opening fence", () => {
    const result = parse_frontmatter("---   \ntitle: Test\n---\nBody");
    expect(result.has_frontmatter).toBe(true);
    expect(result.yaml).toBe("title: Test");
  });

  it("handles trailing whitespace on closing fence", () => {
    const result = parse_frontmatter("---\ntitle: Test\n---   \nBody");
    expect(result.has_frontmatter).toBe(true);
    expect(result.body).toBe("Body");
  });

  it("does not match --- in body", () => {
    const result = parse_frontmatter("---\ntitle: Test\n---\nBody\n---\nMore");
    expect(result.has_frontmatter).toBe(true);
    expect(result.yaml).toBe("title: Test");
    expect(result.body).toBe("Body\n---\nMore");
  });

  it("rejects --- not at byte offset 0", () => {
    const result = parse_frontmatter(" ---\ntitle: Test\n---\nBody");
    expect(result.has_frontmatter).toBe(false);
  });

  it("handles multiline yaml", () => {
    const result = parse_frontmatter(
      "---\ntitle: Test\nauthor: Jane\ntags:\n  - a\n  - b\n---\nBody",
    );
    expect(result.has_frontmatter).toBe(true);
    expect(result.yaml).toBe("title: Test\nauthor: Jane\ntags:\n  - a\n  - b");
    expect(result.body).toBe("Body");
  });

  it("handles \\r\\n line endings in opening fence", () => {
    const result = parse_frontmatter("---\r\ntitle: Test\r\n---\r\nBody");
    expect(result.has_frontmatter).toBe(false);
  });
});

describe("find_frontmatter_span", () => {
  it("returns span with correct offsets", () => {
    const md = "---\ntitle: Test\n---\nBody";
    const span = find_frontmatter_span(md);
    expect(span).not.toBeNull();
    expect(span!.start).toBe(0);
    expect(span!.end).toBe(20);
    expect(span!.yaml).toBe("title: Test");
    expect(md.slice(span!.end)).toBe("Body");
  });

  it("returns null for no frontmatter", () => {
    expect(find_frontmatter_span("Just text")).toBeNull();
  });

  it("returns null for unclosed frontmatter", () => {
    expect(find_frontmatter_span("---\ntitle: Test\n")).toBeNull();
  });
});

describe("rebuild_frontmatter", () => {
  it("rebuilds with yaml and body", () => {
    expect(rebuild_frontmatter("title: Test", "Body")).toBe(
      "---\ntitle: Test\n---\nBody",
    );
  });

  it("returns body only when yaml is empty", () => {
    expect(rebuild_frontmatter("", "Body")).toBe("Body");
  });

  it("returns body only when yaml is whitespace", () => {
    expect(rebuild_frontmatter("  ", "Body")).toBe("Body");
  });
});
