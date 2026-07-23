import { describe, it, expect } from "vitest";
import type { Node as PmNode } from "prosemirror-model";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";

function first_code_block(md: string): PmNode {
  const doc = parse_markdown(md);
  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i);
    if (node.type.name === "code_block") return node;
  }
  throw new Error("no code_block parsed");
}

describe("code-block collapse serialization", () => {
  it("writes a `collapsed` fence token when the node is collapsed", () => {
    const code_block = schema.nodes.code_block.create(
      { language: "mermaid", collapsed: true },
      schema.text("graph TD; A-->B"),
    );
    const doc = schema.nodes.doc.create(null, [code_block]);
    expect(serialize_markdown(doc)).toContain("```mermaid collapsed");
  });

  it("omits the token when the node is expanded", () => {
    const code_block = schema.nodes.code_block.create(
      { language: "mermaid", collapsed: false },
      schema.text("graph TD; A-->B"),
    );
    const doc = schema.nodes.doc.create(null, [code_block]);
    expect(serialize_markdown(doc)).not.toContain("collapsed");
  });

  it("parses the `collapsed` token back into the node attr, off the meta attr", () => {
    const node = first_code_block("```query collapsed\nfrom notes\n```\n");
    expect(node.attrs["collapsed"]).toBe(true);
    expect(node.attrs["meta"]).toBe("");
  });

  it("round-trips a collapsed block byte-for-byte", () => {
    const input = "```mermaid collapsed\ngraph TD; A-->B\n```\n";
    expect(serialize_markdown(parse_markdown(input))).toBe(input);
  });

  it("preserves other meta tokens (preview) alongside collapse", () => {
    const input = "```html preview collapsed\n<b>hi</b>\n```\n";
    const node = first_code_block(input);
    expect(node.attrs["collapsed"]).toBe(true);
    expect(node.attrs["meta"]).toBe("preview");
    expect(serialize_markdown(parse_markdown(input))).toBe(input);
  });

  it("persists collapse on a language-less code block", () => {
    const code_block = schema.nodes.code_block.create(
      { language: "", collapsed: true },
      schema.text("plain text"),
    );
    const doc = schema.nodes.doc.create(null, [code_block]);
    const md = serialize_markdown(doc);
    const node = first_code_block(md);
    expect(node.attrs["collapsed"]).toBe(true);
    expect(node.attrs["language"]).toBe("");
  });

  it("emits a bare fence for an expanded language-less block", () => {
    const code_block = schema.nodes.code_block.create(
      { language: "", collapsed: false },
      schema.text("plain text"),
    );
    const doc = schema.nodes.doc.create(null, [code_block]);
    expect(serialize_markdown(doc)).toBe("```\nplain text\n```\n");
  });
});
