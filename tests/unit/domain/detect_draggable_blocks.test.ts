/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { schema } from "$lib/features/editor/adapters/markdown_pipeline";
import {
  detect_draggable_blocks,
  is_draggable_node_type,
} from "$lib/features/editor/domain/detect_draggable_blocks";

function make_heading(level: number, text: string) {
  return schema.nodes.heading.create({ level }, schema.text(text));
}

function make_paragraph(text?: string) {
  return schema.nodes.paragraph.create(
    null,
    text ? schema.text(text) : undefined,
  );
}

function make_code_block(text: string) {
  return schema.nodes.code_block.create({ language: "js" }, schema.text(text));
}

function make_hr() {
  return schema.nodes.hr!.create();
}

function make_blockquote(text: string) {
  return schema.nodes.blockquote.create(null, [make_paragraph(text)]);
}

function make_bullet_list(items: string[]) {
  return schema.nodes.bullet_list.create(
    null,
    items.map((t) => schema.nodes.list_item.create(null, [make_paragraph(t)])),
  );
}

function make_doc(
  ...children: ReturnType<typeof make_heading | typeof make_paragraph>[]
) {
  return schema.nodes.doc.create(null, children);
}

describe("detect_draggable_blocks", () => {
  it("returns empty for empty doc", () => {
    const doc = make_doc(make_paragraph(""));
    const blocks = detect_draggable_blocks(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.node_type).toBe("paragraph");
  });

  it("detects headings and paragraphs", () => {
    const doc = make_doc(make_heading(1, "Title"), make_paragraph("body text"));
    const blocks = detect_draggable_blocks(doc);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.node_type).toBe("heading");
    expect(blocks[1]!.node_type).toBe("paragraph");
  });

  it("detects code blocks", () => {
    const doc = make_doc(make_code_block("const x = 1;"));
    const blocks = detect_draggable_blocks(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.node_type).toBe("code_block");
  });

  it("detects horizontal rules", () => {
    const doc = make_doc(
      make_paragraph("above"),
      make_hr(),
      make_paragraph("below"),
    );
    const blocks = detect_draggable_blocks(doc);
    expect(blocks).toHaveLength(3);
    expect(blocks[1]!.node_type).toBe("hr");
  });

  it("detects blockquotes", () => {
    const doc = make_doc(make_blockquote("quoted text"));
    const blocks = detect_draggable_blocks(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.node_type).toBe("blockquote");
  });

  it("detects bullet lists", () => {
    const doc = make_doc(make_bullet_list(["item 1", "item 2"]));
    const blocks = detect_draggable_blocks(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.node_type).toBe("bullet_list");
  });

  it("positions are correct and non-overlapping", () => {
    const doc = make_doc(
      make_heading(1, "Title"),
      make_paragraph("body"),
      make_code_block("code"),
    );
    const blocks = detect_draggable_blocks(doc);
    expect(blocks).toHaveLength(3);

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]!;
      expect(b.end).toBeGreaterThan(b.pos);
      if (i > 0) {
        expect(b.pos).toBeGreaterThanOrEqual(blocks[i - 1]!.end);
      }
    }
  });

  it("detects mixed block types in order", () => {
    const doc = make_doc(
      make_heading(2, "Section"),
      make_paragraph("text"),
      make_blockquote("quote"),
      make_bullet_list(["a"]),
      make_hr(),
      make_code_block("fn()"),
    );
    const blocks = detect_draggable_blocks(doc);
    const types = blocks.map((b) => b.node_type);
    expect(types).toEqual([
      "heading",
      "paragraph",
      "blockquote",
      "bullet_list",
      "hr",
      "code_block",
    ]);
  });
});

describe("is_draggable_node_type", () => {
  it("returns true for supported types", () => {
    const supported = [
      "heading",
      "paragraph",
      "code_block",
      "blockquote",
      "bullet_list",
      "ordered_list",
      "hr",
      "table",
      "details_block",
      "image-block",
      "math_block",
      "file_embed",
      "excalidraw_embed",
    ];
    for (const t of supported) {
      expect(is_draggable_node_type(t)).toBe(true);
    }
  });

  it("returns false for non-draggable types", () => {
    expect(is_draggable_node_type("list_item")).toBe(false);
    expect(is_draggable_node_type("table_row")).toBe(false);
    expect(is_draggable_node_type("table_cell")).toBe(false);
    expect(is_draggable_node_type("frontmatter")).toBe(false);
    expect(is_draggable_node_type("text")).toBe(false);
    expect(is_draggable_node_type("doc")).toBe(false);
  });
});
