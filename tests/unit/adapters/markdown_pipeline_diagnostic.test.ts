import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
  schema,
} from "$lib/features/editor/adapters/markdown_pipeline";

describe("markdown pipeline diagnostic", () => {
  it("parses simple markdown to a valid doc", () => {
    const doc = parse_markdown("Hello world");
    expect(doc).toBeTruthy();
    expect(doc.type.name).toBe("doc");
    expect(doc.childCount).toBeGreaterThan(0);
    expect(doc.firstChild?.type.name).toBe("paragraph");
    expect(doc.firstChild?.textContent).toBe("Hello world");
  });

  it("parses heading", () => {
    const doc = parse_markdown("# Title\n\nBody text");
    expect(doc.childCount).toBe(2);
    expect(doc.child(0).type.name).toBe("heading");
    expect(doc.child(0).attrs["level"]).toBe(1);
    expect(doc.child(1).type.name).toBe("paragraph");
  });

  it("parses bullet list", () => {
    const doc = parse_markdown("- item 1\n- item 2");
    expect(doc.childCount).toBe(1);
    expect(doc.child(0).type.name).toBe("bullet_list");
  });

  it("round-trips simple markdown", () => {
    const input = "Hello world";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc);
    expect(output.trim()).toBe(input);
  });

  it("schema has all required node types with toDOM", () => {
    const nodes_to_check = [
      "doc",
      "paragraph",
      "heading",
      "blockquote",
      "code_block",
      "hr",
      "bullet_list",
      "ordered_list",
      "list_item",
      "image-block",
      "image",
      "hardbreak",
      "frontmatter",
      "math_inline",
      "math_block",
      "table",
      "table_header_row",
      "table_row",
      "table_header",
      "table_cell",
    ];
    for (const name of nodes_to_check) {
      const node_type = schema.nodes[name];
      expect(node_type, `Node type '${name}' should exist`).toBeTruthy();
      if (node_type && name !== "doc" && name !== "text") {
        expect(
          node_type.spec.toDOM,
          `Node type '${name}' should have toDOM`,
        ).toBeTruthy();
      }
    }
  });

  it("creates valid doc node that can be used with EditorState", async () => {
    const { EditorState } = await import("prosemirror-state");
    const doc = parse_markdown("# Hello\n\nWorld");
    const state = EditorState.create({ schema, doc });
    expect(state.doc.childCount).toBe(2);
    expect(state.doc.content.size).toBeGreaterThan(0);
  });

  it("parses table markdown", () => {
    const md = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const doc = parse_markdown(md);
    expect(doc.childCount).toBe(1);
    expect(doc.child(0).type.name).toBe("table");
  });

  it("parses frontmatter", () => {
    const md = "---\ntitle: Test\n---\n\nBody";
    const doc = parse_markdown(md);
    expect(doc.childCount).toBe(2);
    expect(doc.child(0).type.name).toBe("frontmatter");
    expect(doc.child(1).type.name).toBe("paragraph");
  });

  it("parses complex document", () => {
    const md = `# Title

Some **bold** and *italic* text.

- List item 1
- List item 2

> Blockquote

\`\`\`js
const x = 1;
\`\`\`

---

[Link](https://example.com)`;

    const doc = parse_markdown(md);
    expect(doc.childCount).toBeGreaterThan(0);

    // Check doc serializes back without error
    const output = serialize_markdown(doc);
    expect(output.length).toBeGreaterThan(0);
  });
});
