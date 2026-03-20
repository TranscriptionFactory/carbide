/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { schema } from "$lib/features/editor/adapters/schema";
import { Slice, Fragment } from "prosemirror-model";
import { serialize_markdown } from "$lib/features/editor/adapters/markdown_pipeline";

function clipboard_text_serializer(slice: Slice): string {
  let all_code = true;
  slice.content.forEach((node) => {
    if (node.type.name !== "code_block") all_code = false;
  });
  if (all_code && slice.content.childCount > 0) {
    const parts: string[] = [];
    slice.content.forEach((node) => {
      parts.push(node.textContent);
    });
    return parts.join("\n");
  }
  const wrap = schema.topNodeType.create(null, slice.content);
  return serialize_markdown(wrap);
}

describe("clipboardTextSerializer", () => {
  it("returns plain text for code block content", () => {
    const code_block = schema.nodes.code_block.create(
      { language: "js" },
      schema.text("const x = 1;"),
    );
    const slice = new Slice(Fragment.from(code_block), 0, 0);
    expect(clipboard_text_serializer(slice)).toBe("const x = 1;");
  });

  it("returns plain text for multiple code blocks", () => {
    const block1 = schema.nodes.code_block.create({}, schema.text("line1"));
    const block2 = schema.nodes.code_block.create({}, schema.text("line2"));
    const slice = new Slice(Fragment.from([block1, block2]), 0, 0);
    expect(clipboard_text_serializer(slice)).toBe("line1\nline2");
  });

  it("uses markdown serializer for non-code-block content", () => {
    const para = schema.nodes.paragraph.create(null, schema.text("hello"));
    const slice = new Slice(Fragment.from(para), 0, 0);
    const result = clipboard_text_serializer(slice);
    expect(result).toContain("hello");
    expect(result).not.toContain("```");
  });

  it("uses markdown serializer for mixed content", () => {
    const para = schema.nodes.paragraph.create(null, schema.text("hello"));
    const code = schema.nodes.code_block.create({}, schema.text("code"));
    const slice = new Slice(Fragment.from([para, code]), 0, 0);
    const result = clipboard_text_serializer(slice);
    expect(result).toContain("```");
  });
});
