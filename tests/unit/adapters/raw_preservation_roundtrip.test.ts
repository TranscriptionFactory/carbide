import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";

function roundtrip(markdown: string): string {
  return serialize_markdown(parse_markdown(markdown));
}

function inline_types(markdown: string): string[] {
  const para = parse_markdown(markdown).child(0);
  const types: string[] = [];
  para.forEach((child) => types.push(child.type.name));
  return types;
}

describe("raw block preservation", () => {
  it("preserves an HTML block that swallows following blocks (no blank line)", () => {
    const input = `<div class="banner">\n> [!warning] Watch out\n> This is a warning`;
    const doc = parse_markdown(input);
    expect(doc.childCount).toBe(1);
    expect(doc.child(0).type.name).toBe("raw_block");
    expect(doc.child(0).textContent).toBe(input);

    const once = roundtrip(input);
    expect(once.trimEnd()).toBe(input);
    expect(roundtrip(once)).toBe(once);
  });

  it("still converts embeddable HTML followed by a blank line to web_embed", () => {
    const input = `<iframe src="https://example.com/embed"></iframe>\n\n> [!note]\n> Body text`;
    const doc = parse_markdown(input);
    expect(doc.child(0).type.name).toBe("web_embed");
    expect(doc.child(1).type.name).toBe("callout");
  });

  it("preserves HTML comments verbatim", () => {
    const input = "<!-- a hidden note -->";
    const doc = parse_markdown(input);
    expect(doc.child(0).type.name).toBe("raw_block");
    expect(doc.child(0).textContent).toBe(input);
    expect(roundtrip(input).trimEnd()).toBe(input);
  });

  it("preserves reference link definitions", () => {
    const input = "See [link text][ref].\n\n[ref]: https://example.com";
    const doc = parse_markdown(input);
    expect(doc.child(1).type.name).toBe("raw_block");
    expect(doc.child(1).textContent).toBe("[ref]: https://example.com");

    const once = roundtrip(input);
    expect(once.trimEnd()).toBe(input);
    expect(roundtrip(once)).toBe(once);
  });

  it("preserves reference images", () => {
    const input = "![alt text][img]\n\n[img]: /assets/test.png";
    const once = roundtrip(input);
    expect(once.trimEnd()).toBe(input);
    expect(roundtrip(once)).toBe(once);
  });

  it("preserves footnote references and definitions", () => {
    const input = "A claim.[^1]\n\n[^1]: The footnote body.";
    const doc = parse_markdown(input);
    expect(inline_types(input)).toContain("raw_inline");
    expect(doc.child(1).type.name).toBe("raw_block");
    expect(doc.child(1).textContent).toBe("[^1]: The footnote body.");

    const once = roundtrip(input);
    expect(once.trimEnd()).toBe(input);
    expect(roundtrip(once)).toBe(once);
  });
});

describe("raw inline preservation", () => {
  it("preserves inline HTML tags verbatim", () => {
    const input = "Press <kbd>Ctrl</kbd> to copy.";
    expect(inline_types(input)).toContain("raw_inline");
    expect(roundtrip(input).trimEnd()).toBe(input);
  });

  it("keeps marks on inline HTML inside emphasis", () => {
    const input = "*press <kbd>K</kbd> now*";
    expect(roundtrip(input).trimEnd()).toBe(input);
  });

  it("preserves reference-style links inline", () => {
    const input = "See [link text][ref].\n\n[ref]: https://example.com";
    expect(inline_types(input)).toContain("raw_inline");
    expect(roundtrip(input).trimEnd()).toBe(input);
  });
});
