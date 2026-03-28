import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";
import { pm_to_mdast } from "$lib/features/editor/adapters/pm_to_mdast";

describe("trailing empty paragraph serialization", () => {
  it("does not produce trailing blank line when doc ends with empty paragraph", () => {
    const code_block = schema.nodes.code_block.create(
      { language: "ts" },
      schema.text("const x = 1;"),
    );
    const trailing_para = schema.nodes.paragraph.create();
    const doc = schema.nodes.doc.create(null, [code_block, trailing_para]);
    const output = serialize_markdown(doc);
    expect(output).not.toMatch(/\n\s*\n$/);
    expect(output.trim()).toBe("```ts\nconst x = 1;\n```");
  });

  it("does not strip non-empty trailing paragraph", () => {
    const code_block = schema.nodes.code_block.create(
      { language: "" },
      schema.text("hello"),
    );
    const trailing_para = schema.nodes.paragraph.create(
      null,
      schema.text("after"),
    );
    const doc = schema.nodes.doc.create(null, [code_block, trailing_para]);
    const output = serialize_markdown(doc);
    expect(output).toContain("after");
  });

  it("round-trips markdown ending with code block without adding trailing blank line", () => {
    const input = "```js\nconsole.log('hi')\n```";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc);
    expect(output.trimEnd()).toBe(input);
  });

  it("preserves mdast structure when doc has no trailing empty paragraph", () => {
    const para = schema.nodes.paragraph.create(null, schema.text("hello"));
    const doc = schema.nodes.doc.create(null, [para]);
    const tree = pm_to_mdast(doc);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]?.type).toBe("paragraph");
  });

  it("strips single trailing empty paragraph from mdast output", () => {
    const para = schema.nodes.paragraph.create(null, schema.text("content"));
    const empty_para = schema.nodes.paragraph.create();
    const doc = schema.nodes.doc.create(null, [para, empty_para]);
    const tree = pm_to_mdast(doc);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]?.type).toBe("paragraph");
  });
});
