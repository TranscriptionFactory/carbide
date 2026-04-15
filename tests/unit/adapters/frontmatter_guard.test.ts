import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  create_frontmatter_guard_plugin,
  SKIP_FRONTMATTER_GUARD,
} from "$lib/features/editor/adapters/frontmatter_guard_plugin";

function make_state_with_frontmatter(body_text: string) {
  const fm = schema.nodes.frontmatter.create(null, schema.text("title: Test"));
  const para = schema.nodes.paragraph.create(
    null,
    body_text ? schema.text(body_text) : undefined,
  );
  const doc = schema.nodes.doc.create(null, [fm, para]);
  return EditorState.create({
    doc,
    schema,
    plugins: [create_frontmatter_guard_plugin()],
  });
}

describe("frontmatter guard plugin", () => {
  it("clips selectAll to exclude frontmatter", () => {
    const state = make_state_with_frontmatter("hello");
    const select_all = state.tr.setSelection(
      TextSelection.create(state.doc, 0, state.doc.content.size),
    );
    const next = state.apply(select_all);
    const fm_end = state.doc.firstChild!.nodeSize;
    expect(next.selection.from).toBeGreaterThanOrEqual(fm_end);
  });

  it("allows normal selection within body", () => {
    const state = make_state_with_frontmatter("hello world");
    const fm_size = state.doc.firstChild!.nodeSize;
    const body_start = fm_size + 1;
    const select_body = state.tr.setSelection(
      TextSelection.create(state.doc, body_start, body_start + 5),
    );
    const next = state.apply(select_body);
    expect(next.selection.from).toBe(body_start);
    expect(next.selection.to).toBe(body_start + 5);
  });

  it("rejects transaction that deletes frontmatter via user action", () => {
    const state = make_state_with_frontmatter("hello");
    const para = schema.nodes.paragraph.create(null, schema.text("replaced"));
    const new_doc_content = schema.nodes.doc.create(null, [para]);
    const tr = state.tr.replaceWith(
      0,
      state.doc.content.size,
      new_doc_content.content,
    );
    const next = state.apply(tr);
    expect(next.doc.firstChild?.type.name).toBe("frontmatter");
  });

  it("allows programmatic full-doc replacement (addToHistory=false)", () => {
    const state = make_state_with_frontmatter("hello");
    const para = schema.nodes.paragraph.create(
      null,
      schema.text("new content"),
    );
    const new_doc_content = schema.nodes.doc.create(null, [para]);
    const tr = state.tr.replaceWith(
      0,
      state.doc.content.size,
      new_doc_content.content,
    );
    tr.setMeta("addToHistory", false);
    const next = state.apply(tr);
    expect(next.doc.firstChild?.type.name).toBe("paragraph");
  });

  it("allows undoable full-doc replacement with SKIP_FRONTMATTER_GUARD", () => {
    const state = make_state_with_frontmatter("hello");
    const para = schema.nodes.paragraph.create(
      null,
      schema.text("replaced by lint"),
    );
    const new_doc_content = schema.nodes.doc.create(null, [para]);
    const tr = state.tr.replaceWith(
      0,
      state.doc.content.size,
      new_doc_content.content,
    );
    tr.setMeta(SKIP_FRONTMATTER_GUARD, true);
    const next = state.apply(tr);
    expect(next.doc.firstChild?.type.name).toBe("paragraph");
  });

  it("allows transaction that preserves frontmatter", () => {
    const state = make_state_with_frontmatter("hello");
    const fm = schema.nodes.frontmatter.create(
      null,
      schema.text("title: Updated"),
    );
    const para = schema.nodes.paragraph.create(null, schema.text("new body"));
    const new_doc_content = schema.nodes.doc.create(null, [fm, para]);
    const tr = state.tr.replaceWith(
      0,
      state.doc.content.size,
      new_doc_content.content,
    );
    const next = state.apply(tr);
    expect(next.doc.firstChild?.type.name).toBe("frontmatter");
    expect(next.doc.firstChild?.textContent).toBe("title: Updated");
  });
});
