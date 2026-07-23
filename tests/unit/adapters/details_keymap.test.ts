/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_details_keymap_prose_plugin } from "$lib/features/editor/adapters/details_keymap_plugin";

function make_details_doc(
  summary_text: string,
  body_text: string,
  open: boolean,
) {
  const summary = schema.nodes.details_summary.create(
    null,
    summary_text ? schema.text(summary_text) : undefined,
  );
  const content = schema.nodes.details_content.create(null, [
    schema.nodes.paragraph.create(
      null,
      body_text ? schema.text(body_text) : undefined,
    ),
  ]);
  const details = schema.nodes.details_block.create({ open }, [
    summary,
    content,
  ]);
  return schema.nodes.doc.create(null, [details]);
}

function make_view(doc: ReturnType<typeof make_details_doc>) {
  const el = document.createElement("div");
  const state = EditorState.create({
    doc,
    schema,
    plugins: [create_details_keymap_prose_plugin()],
  });
  return new EditorView(el, { state });
}

function fire_key(view: EditorView, key: string): boolean {
  const plugin = create_details_keymap_prose_plugin();
  const handler = plugin.props.handleKeyDown!;
  const event = new KeyboardEvent("keydown", { key });
  return handler.call(plugin, view, event) as boolean;
}

function summary_end_pos(view: EditorView): number {
  // details open (1) + summary open (1) + summary content length
  const summary = view.state.doc.child(0).child(0);
  return 2 + summary.content.size;
}

function place_caret_at_summary_end(view: EditorView) {
  const tr = view.state.tr.setSelection(
    TextSelection.create(view.state.doc, summary_end_pos(view)),
  );
  view.dispatch(tr);
}

function details_attrs_open(view: EditorView): boolean {
  return view.state.doc.child(0).attrs["open"] as boolean;
}

describe("details keymap plugin — collapsed section", () => {
  it("ArrowDown after collapsed details skips past it without opening", () => {
    const view = make_view(make_details_doc("Summary", "Body", false));
    place_caret_at_summary_end(view);

    const handled = fire_key(view, "ArrowDown");
    expect(handled).toBe(true);

    const $pos = view.state.selection.$from;
    expect($pos.parent.type.name).toBe("paragraph");
    const in_details = (() => {
      for (let d = $pos.depth; d >= 0; d--) {
        if ($pos.node(d).type === schema.nodes.details_block) return true;
      }
      return false;
    })();
    expect(in_details).toBe(false);
    expect(details_attrs_open(view)).toBe(false);
    view.destroy();
  });

  it("Enter after collapsed details skips past it without opening", () => {
    const view = make_view(make_details_doc("Summary", "Body", false));
    place_caret_at_summary_end(view);

    const handled = fire_key(view, "Enter");
    expect(handled).toBe(true);

    const $pos = view.state.selection.$from;
    expect($pos.parent.type.name).toBe("paragraph");
    const in_details = (() => {
      for (let d = $pos.depth; d >= 0; d--) {
        if ($pos.node(d).type === schema.nodes.details_block) return true;
      }
      return false;
    })();
    expect(in_details).toBe(false);
    expect(details_attrs_open(view)).toBe(false);
    view.destroy();
  });

  it("Enter in an open details dives into its body", () => {
    const view = make_view(make_details_doc("Summary", "Body", true));
    place_caret_at_summary_end(view);

    const handled = fire_key(view, "Enter");
    expect(handled).toBe(true);

    const $pos = view.state.selection.$from;
    const in_content = (() => {
      for (let d = $pos.depth; d >= 0; d--) {
        if ($pos.node(d).type === schema.nodes.details_content) return true;
      }
      return false;
    })();
    expect(in_content).toBe(true);
    expect(details_attrs_open(view)).toBe(true);
    view.destroy();
  });
});
