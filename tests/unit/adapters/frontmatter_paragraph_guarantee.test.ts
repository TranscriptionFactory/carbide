import { describe, it, expect } from "vitest";
import { parse_markdown } from "$lib/features/editor/adapters/markdown_pipeline";

describe("frontmatter paragraph guarantee", () => {
  it("adds empty paragraph after frontmatter-only doc", () => {
    const doc = parse_markdown("---\ntags: []\n---");
    expect(doc.childCount).toBe(2);
    expect(doc.child(0).type.name).toBe("frontmatter");
    expect(doc.child(1).type.name).toBe("paragraph");
  });

  it("does not add extra paragraph when body content exists", () => {
    const doc = parse_markdown("---\ntags: []\n---\n\nSome body text");
    expect(doc.child(0).type.name).toBe("frontmatter");
    expect(doc.childCount).toBeGreaterThanOrEqual(2);
    expect(doc.child(1).type.name).toBe("paragraph");
    expect(doc.child(1).textContent).toBe("Some body text");
  });

  it("parses doc without frontmatter normally", () => {
    const doc = parse_markdown("Just some text");
    expect(doc.childCount).toBe(1);
    expect(doc.child(0).type.name).toBe("paragraph");
  });
});
