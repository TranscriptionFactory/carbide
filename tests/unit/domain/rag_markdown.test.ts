/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  render_rag_markdown,
  CITATION_INDEX_ATTR,
} from "$lib/features/rag/domain/rag_markdown";
import type { RagCitation } from "$lib/features/rag/domain/rag_types";

function citations(...items: RagCitation[]): Map<number, RagCitation> {
  return new Map(items.map((c) => [c.index, c]));
}

const q: RagCitation = { index: 1, note_path: "notes/q.md", title: "Q" };

describe("render_rag_markdown", () => {
  it("renders markdown emphasis, headings, and lists as HTML", () => {
    const html = render_rag_markdown(
      "## Findings\n\n**bold** and *italic*\n\n- one\n- two",
      citations(),
    );

    expect(html).toContain("<h2>Findings</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<li>one</li>");
  });

  it("renders fenced code blocks", () => {
    const html = render_rag_markdown("```\nlet x = 1;\n```", citations());
    expect(html).toContain("<pre>");
    expect(html).toContain("let x = 1;");
  });

  it("replaces known citation markers with interactive buttons", () => {
    const html = render_rag_markdown("The answer is 42 [1].", citations(q));

    expect(html).toContain(`${CITATION_INDEX_ATTR}="1"`);
    expect(html).toContain(">[1]</button>");
  });

  it("escapes citation titles used in the button tooltip", () => {
    const html = render_rag_markdown(
      "See [1].",
      citations({ ...q, title: '<img src=x onerror="pwn">' }),
    );

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("leaves unmapped [n] markers as literal text", () => {
    const html = render_rag_markdown("Fake source [7].", citations(q));

    expect(html).toContain("[7]");
    expect(html).not.toContain(CITATION_INDEX_ATTR);
  });

  it("strips raw HTML from the model output", () => {
    const html = render_rag_markdown(
      '<script>alert("x")</script> hello',
      citations(),
    );

    expect(html).not.toContain("<script");
    expect(html).toContain("hello");
  });

  it("keeps a citation marker inside emphasized markdown", () => {
    const html = render_rag_markdown("**important [1]**", citations(q));

    expect(html).toContain("<strong>");
    expect(html).toContain(`${CITATION_INDEX_ATTR}="1"`);
  });
});
