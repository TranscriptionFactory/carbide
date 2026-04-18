/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_heading_keymap_prose_plugin } from "$lib/features/editor/adapters/heading_keymap_plugin";
import {
  create_heading_fold_prose_plugin,
  heading_fold_plugin_key,
  compute_heading_ranges,
} from "$lib/features/editor/adapters/heading_fold_plugin";

function make_heading(level: number, text: string) {
  return schema.nodes.heading.create({ level }, schema.text(text));
}

function make_paragraph(text: string) {
  return schema.nodes.paragraph.create(null, schema.text(text));
}

function make_doc(...children: ReturnType<typeof make_heading>[]) {
  return schema.nodes.doc.create(null, children);
}

function make_view(doc: ReturnType<typeof make_doc>) {
  const el = document.createElement("div");
  const state = EditorState.create({
    doc,
    plugins: [
      create_heading_fold_prose_plugin(),
      create_heading_keymap_prose_plugin(),
    ],
  });
  return new EditorView(el, { state });
}

function fire_key(view: EditorView, key: string): boolean {
  const plugin = create_heading_keymap_prose_plugin();
  const handler = plugin.props.handleKeyDown!;
  const event = new KeyboardEvent("keydown", { key });
  return handler.call(plugin, view, event) as boolean;
}

function fold_heading(view: EditorView, heading_pos: number) {
  const tr = view.state.tr.setMeta(heading_fold_plugin_key, {
    action: "toggle",
    pos: heading_pos,
  });
  view.dispatch(tr);
}

describe("heading keymap plugin", () => {
  describe("Enter on folded heading", () => {
    it("inserts paragraph after collapsed section when cursor is at end of heading", () => {
      const doc = make_doc(
        make_heading(1, "Title"),
        make_paragraph("body content"),
        make_heading(1, "Next"),
        make_paragraph("next content"),
      );
      const view = make_view(doc);

      const ranges = compute_heading_ranges(view.state.doc);
      const heading_pos = ranges[0]!.heading_pos;
      fold_heading(view, heading_pos);

      // Place cursor at the end of the heading text ("Title")
      const heading_end_text = heading_pos + 1 + "Title".length;
      const sel = TextSelection.create(view.state.doc, heading_end_text);
      view.dispatch(view.state.tr.setSelection(sel));

      const handled = fire_key(view, "Enter");

      expect(handled).toBe(true);
      // A new paragraph should have been inserted after the collapsed body
      const insert_pos = ranges[0]!.body_end;
      const new_node = view.state.doc.nodeAt(insert_pos);
      expect(new_node?.type.name).toBe("paragraph");
      expect(new_node?.content.size).toBe(0);
    });

    it("does not intercept Enter when heading is not folded", () => {
      const doc = make_doc(
        make_heading(1, "Title"),
        make_paragraph("body content"),
      );
      const view = make_view(doc);

      const ranges = compute_heading_ranges(view.state.doc);
      const heading_pos = ranges[0]!.heading_pos;
      const heading_end_text = heading_pos + 1 + "Title".length;
      const sel = TextSelection.create(view.state.doc, heading_end_text);
      view.dispatch(view.state.tr.setSelection(sel));

      const handled = fire_key(view, "Enter");

      expect(handled).toBe(false);
    });

    it("does not intercept Enter when cursor is not at end of heading", () => {
      const doc = make_doc(
        make_heading(1, "Title"),
        make_paragraph("body content"),
      );
      const view = make_view(doc);

      const ranges = compute_heading_ranges(view.state.doc);
      const heading_pos = ranges[0]!.heading_pos;
      fold_heading(view, heading_pos);

      // Place cursor at the start of the heading text
      const sel = TextSelection.create(view.state.doc, heading_pos + 1);
      view.dispatch(view.state.tr.setSelection(sel));

      const handled = fire_key(view, "Enter");

      expect(handled).toBe(false);
    });

    it("places cursor inside the new paragraph", () => {
      const doc = make_doc(make_heading(1, "Title"), make_paragraph("body"));
      const view = make_view(doc);

      const ranges = compute_heading_ranges(view.state.doc);
      const heading_pos = ranges[0]!.heading_pos;
      fold_heading(view, heading_pos);

      const heading_end_text = heading_pos + 1 + "Title".length;
      const sel = TextSelection.create(view.state.doc, heading_end_text);
      view.dispatch(view.state.tr.setSelection(sel));

      fire_key(view, "Enter");

      const cursor = view.state.selection;
      const $pos = cursor.$from;
      expect($pos.parent.type.name).toBe("paragraph");
      expect($pos.parent.content.size).toBe(0);
    });
  });

  describe("Backspace at start of heading", () => {
    it("converts heading to paragraph", () => {
      const doc = make_doc(make_heading(1, "Title"));
      const view = make_view(doc);

      const sel = TextSelection.create(view.state.doc, 1);
      view.dispatch(view.state.tr.setSelection(sel));

      const handled = fire_key(view, "Backspace");

      expect(handled).toBe(true);
      expect(view.state.doc.firstChild?.type.name).toBe("paragraph");
    });
  });
});
