import { describe, it, expect, vi } from "vitest";
import { parse_markdown } from "$lib/features/editor/adapters/markdown_pipeline";

describe("markdown fallback deserialization", () => {
  it("parses valid markdown normally", () => {
    const doc = parse_markdown("# Hello\n\nWorld");
    expect(doc.type.name).toBe("doc");
    expect(doc.childCount).toBe(2);
    expect(doc.child(0).type.name).toBe("heading");
    expect(doc.child(1).type.name).toBe("paragraph");
  });

  it("parses markdown with math via primary parser", () => {
    const doc = parse_markdown("Inline $x^2$ math");
    expect(doc.type.name).toBe("doc");
    expect(doc.childCount).toBeGreaterThan(0);
  });

  it("returns valid doc for empty string", () => {
    const doc = parse_markdown("");
    expect(doc.type.name).toBe("doc");
  });
});
