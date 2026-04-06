/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import { schema } from "$lib/features/editor/adapters/markdown_pipeline";
import {
  compute_block_drop,
  resolve_drop_target,
  apply_block_move,
} from "$lib/features/editor/domain/compute_block_drop";

function make_heading(level: number, text: string) {
  return schema.nodes.heading.create({ level }, schema.text(text));
}

function make_paragraph(text: string) {
  return schema.nodes.paragraph.create(null, schema.text(text));
}

function make_code_block(text: string) {
  return schema.nodes.code_block.create({ language: "" }, schema.text(text));
}

function make_doc(
  ...children: ReturnType<typeof make_heading | typeof make_paragraph>[]
) {
  return schema.nodes.doc.create(null, children);
}

function block_texts(doc: ReturnType<typeof make_doc>): string[] {
  const texts: string[] = [];
  doc.forEach((node) => {
    texts.push(node.textContent);
  });
  return texts;
}

describe("resolve_drop_target", () => {
  it("snaps to block boundary before when pos is in upper half", () => {
    const doc = make_doc(make_heading(1, "A"), make_paragraph("B"));
    const heading_start = 0;
    const result = resolve_drop_target(doc, heading_start + 1);
    expect(result).toBe(heading_start);
  });

  it("snaps to block boundary after when pos is in lower half", () => {
    const doc = make_doc(make_heading(1, "A"), make_paragraph("B"));
    const heading_end = doc.child(0).nodeSize;
    const result = resolve_drop_target(doc, heading_end - 1);
    expect(result).toBe(heading_end);
  });

  it("handles position at document start", () => {
    const doc = make_doc(make_paragraph("text"));
    const result = resolve_drop_target(doc, 0);
    expect(result).toBe(0);
  });

  it("handles position beyond doc content", () => {
    const doc = make_doc(make_paragraph("text"));
    const result = resolve_drop_target(doc, doc.content.size + 100);
    expect(result).toBe(doc.content.size);
  });
});

describe("compute_block_drop", () => {
  it("returns null when dropping onto source block", () => {
    const doc = make_doc(make_heading(1, "A"), make_paragraph("B"));
    const result = compute_block_drop(doc, 0, 1);
    expect(result).toBeNull();
  });

  it("returns null for non-draggable source", () => {
    const doc = make_doc(make_paragraph("text"));
    const list_item = schema.nodes.list_item.create(null, [
      make_paragraph("item"),
    ]);
    const list = schema.nodes.bullet_list.create(null, [list_item]);
    const doc_with_list = make_doc(list);

    const li_pos = 1;
    const result = compute_block_drop(doc_with_list, li_pos, 0);
    expect(result).toBeNull();
  });

  it("computes move down correctly", () => {
    const doc = make_doc(
      make_heading(1, "A"),
      make_paragraph("B"),
      make_paragraph("C"),
    );
    const source = 0;
    const after_C = doc.content.size;
    const result = compute_block_drop(doc, source, after_C);
    expect(result).not.toBeNull();
    expect(result!.from).toBe(source);
    expect(result!.to).toBe(doc.child(0).nodeSize);
    expect(result!.insert_pos).toBe(after_C);
  });

  it("computes move up correctly", () => {
    const doc = make_doc(
      make_heading(1, "A"),
      make_paragraph("B"),
      make_paragraph("C"),
    );
    const p_c_start = doc.child(0).nodeSize + doc.child(1).nodeSize;
    const result = compute_block_drop(doc, p_c_start, 0);
    expect(result).not.toBeNull();
    expect(result!.insert_pos).toBe(0);
  });
});

describe("apply_block_move", () => {
  it("moves first block to end", () => {
    const doc = make_doc(
      make_heading(1, "A"),
      make_paragraph("B"),
      make_paragraph("C"),
    );
    const state = EditorState.create({ doc });

    const result = compute_block_drop(doc, 0, doc.content.size)!;
    expect(result).not.toBeNull();

    const tr = state.tr;
    apply_block_move(tr, result);
    const new_doc = tr.doc;

    expect(block_texts(new_doc)).toEqual(["B", "C", "A"]);
  });

  it("moves last block to start", () => {
    const doc = make_doc(
      make_heading(1, "A"),
      make_paragraph("B"),
      make_paragraph("C"),
    );
    const state = EditorState.create({ doc });
    const c_pos = doc.child(0).nodeSize + doc.child(1).nodeSize;

    const result = compute_block_drop(doc, c_pos, 0)!;
    expect(result).not.toBeNull();

    const tr = state.tr;
    apply_block_move(tr, result);

    expect(block_texts(tr.doc)).toEqual(["C", "A", "B"]);
  });

  it("swaps adjacent blocks (move second before first)", () => {
    const doc = make_doc(make_paragraph("A"), make_paragraph("B"));
    const state = EditorState.create({ doc });
    const b_pos = doc.child(0).nodeSize;

    const result = compute_block_drop(doc, b_pos, 0)!;
    const tr = state.tr;
    apply_block_move(tr, result);

    expect(block_texts(tr.doc)).toEqual(["B", "A"]);
  });

  it("moves middle block to start", () => {
    const doc = make_doc(
      make_paragraph("A"),
      make_paragraph("B"),
      make_paragraph("C"),
    );
    const state = EditorState.create({ doc });
    const b_pos = doc.child(0).nodeSize;

    const result = compute_block_drop(doc, b_pos, 0)!;
    const tr = state.tr;
    apply_block_move(tr, result);

    expect(block_texts(tr.doc)).toEqual(["B", "A", "C"]);
  });

  it("preserves node attributes (heading level)", () => {
    const doc = make_doc(make_paragraph("text"), make_heading(2, "Section"));
    const state = EditorState.create({ doc });
    const h_pos = doc.child(0).nodeSize;

    const result = compute_block_drop(doc, h_pos, 0)!;
    const tr = state.tr;
    apply_block_move(tr, result);

    const first = tr.doc.child(0);
    expect(first.type.name).toBe("heading");
    expect(first.attrs.level).toBe(2);
  });

  it("preserves code block content and attributes", () => {
    const doc = make_doc(
      make_paragraph("intro"),
      make_code_block("const x = 1;"),
    );
    const state = EditorState.create({ doc });
    const code_pos = doc.child(0).nodeSize;

    const result = compute_block_drop(doc, code_pos, 0)!;
    const tr = state.tr;
    apply_block_move(tr, result);

    expect(tr.doc.child(0).type.name).toBe("code_block");
    expect(tr.doc.child(0).textContent).toBe("const x = 1;");
  });

  it("no-op when source equals target position", () => {
    const doc = make_doc(make_paragraph("A"), make_paragraph("B"));
    const result = compute_block_drop(doc, 0, 1);
    expect(result).toBeNull();
  });
});
