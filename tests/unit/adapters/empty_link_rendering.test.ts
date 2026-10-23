/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { DOMSerializer } from "prosemirror-model";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";

function render(markdown: string): HTMLElement {
  const doc = parse_markdown(markdown);
  const host = document.createElement("div");
  host.appendChild(
    DOMSerializer.fromSchema(schema).serializeFragment(doc.content),
  );
  return host;
}

describe("empty-text link rendering", () => {
  it("marks the empty-link raw_inline for muted styling", () => {
    const span = render("a [](https://x) b\n").querySelector(
      "[data-type='raw_inline']",
    );
    expect(span?.hasAttribute("data-empty-link")).toBe(true);
    expect(span?.textContent).toBe("[](https://x)");
  });

  it("leaves other raw inline content unmarked", () => {
    const span = render("a <!-- c --> b\n").querySelector(
      "[data-type='raw_inline']",
    );
    expect(span).not.toBeNull();
    expect(span?.hasAttribute("data-empty-link")).toBe(false);
  });

  it("still round-trips [](https://x) byte-identical", () => {
    const markdown = "[](https://x)\n";
    expect(serialize_markdown(parse_markdown(markdown))).toBe(markdown);
  });

  it("reparses the marked DOM to the same source value", () => {
    const span = render("[](https://x)\n").querySelector(
      "[data-type='raw_inline']",
    );
    if (!span) throw new Error("no raw_inline");
    const wrapper = document.createElement("p");
    wrapper.appendChild(span);
    const reparsed = schema.nodes.raw_inline.spec.parseDOM?.[0]?.getAttrs?.(
      span as HTMLElement,
    );
    expect(reparsed).toEqual({ value: "[](https://x)" });
  });
});
