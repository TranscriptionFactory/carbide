/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_callout_keymap_prose_plugin } from "$lib/features/editor/adapters/callout_keymap_plugin";

function make_callout_doc(title_text: string, body_text: string) {
  const title = schema.nodes.callout_title.create(
    null,
    title_text ? schema.text(title_text) : undefined,
  );
  const body = schema.nodes.callout_body.create(null, [
    schema.nodes.paragraph.create(
      null,
      body_text ? schema.text(body_text) : undefined,
    ),
  ]);
  const callout = schema.nodes.callout.create(
    { callout_type: "note", foldable: false, default_folded: false },
    [title, body],
  );
  return schema.nodes.doc.create(null, [callout]);
}

function make_view(doc: ReturnType<typeof make_callout_doc>) {
  const el = document.createElement("div");
  const state = EditorState.create({
    doc,
    schema,
    plugins: [create_callout_keymap_prose_plugin()],
  });
  return new EditorView(el, { state });
}

function fire_key(view: EditorView, key: string): boolean {
  const plugin = create_callout_keymap_prose_plugin();
  const handler = plugin.props.handleKeyDown!;
  const event = new KeyboardEvent("keydown", { key });
  return handler.call(plugin, view, event) as boolean;
}

describe("callout keymap plugin", () => {
  it("Enter in callout title moves cursor to body", () => {
    const doc = make_callout_doc("Title", "Body text");
    const view = make_view(doc);

    const title_start = 2;
    const tr = view.state.tr.setSelection(
      TextSelection.create(view.state.doc, title_start),
    );
    view.dispatch(tr);

    const handled = fire_key(view, "Enter");
    expect(handled).toBe(true);

    const $pos = view.state.selection.$from;
    expect($pos.parent.type.name).toBe("paragraph");

    const callout_body_found = (() => {
      for (let d = $pos.depth; d >= 0; d--) {
        if ($pos.node(d).type === schema.nodes.callout_body) return true;
      }
      return false;
    })();
    expect(callout_body_found).toBe(true);
    view.destroy();
  });

  it("ArrowDown at end of title moves to body", () => {
    const doc = make_callout_doc("Title", "Body text");
    const view = make_view(doc);

    const title_end = 2 + "Title".length;
    const tr = view.state.tr.setSelection(
      TextSelection.create(view.state.doc, title_end),
    );
    view.dispatch(tr);

    const handled = fire_key(view, "ArrowDown");
    expect(handled).toBe(true);

    const $pos = view.state.selection.$from;
    expect($pos.parent.type.name).toBe("paragraph");
    view.destroy();
  });

  it("ArrowDown mid-title does nothing", () => {
    const doc = make_callout_doc("Title", "Body text");
    const view = make_view(doc);

    const mid_title = 2 + 2;
    const tr = view.state.tr.setSelection(
      TextSelection.create(view.state.doc, mid_title),
    );
    view.dispatch(tr);

    const handled = fire_key(view, "ArrowDown");
    expect(handled).toBe(false);

    expect(view.state.selection.$from.pos).toBe(mid_title);
    view.destroy();
  });

  it("Backspace at start of empty callout replaces with paragraph", () => {
    const doc = make_callout_doc("", "");
    const view = make_view(doc);

    const title_start = 2;
    const tr = view.state.tr.setSelection(
      TextSelection.create(view.state.doc, title_start),
    );
    view.dispatch(tr);

    const handled = fire_key(view, "Backspace");
    expect(handled).toBe(true);

    const new_doc = view.state.doc;
    expect(new_doc.childCount).toBe(1);
    expect(new_doc.child(0).type.name).toBe("paragraph");
    expect(new_doc.child(0).content.size).toBe(0);
    view.destroy();
  });

  it("Backspace at start of non-empty callout title unwraps", () => {
    const doc = make_callout_doc("Title", "Body text");
    const view = make_view(doc);

    const title_start = 2;
    const tr = view.state.tr.setSelection(
      TextSelection.create(view.state.doc, title_start),
    );
    view.dispatch(tr);

    const handled = fire_key(view, "Backspace");
    expect(handled).toBe(true);

    const new_doc = view.state.doc;
    expect(new_doc.child(0).type.name).toBe("paragraph");
    expect(new_doc.child(0).textContent).toBe("Title");
    expect(new_doc.child(1).type.name).toBe("paragraph");
    expect(new_doc.child(1).textContent).toBe("Body text");
    view.destroy();
  });

  it("Backspace at start of first body paragraph moves cursor to title end", () => {
    const doc = make_callout_doc("Title", "Body text");
    const view = make_view(doc);

    // Position inside first paragraph of body
    // callout(1) > title(2..7) > body_start
    // callout_pos=0, +1=callout open, +1=title open = 2, title content "Title" = 5 chars
    // title close = 8, body open = 9, para open = 10
    const body_para_start = 10;
    const tr = view.state.tr.setSelection(
      TextSelection.create(view.state.doc, body_para_start),
    );
    view.dispatch(tr);

    const handled = fire_key(view, "Backspace");
    expect(handled).toBe(true);

    const $pos = view.state.selection.$from;
    expect($pos.parent.type.name).toBe("callout_title");
    expect($pos.parentOffset).toBe("Title".length);
    view.destroy();
  });

  it("Backspace mid-title does nothing", () => {
    const doc = make_callout_doc("Title", "Body text");
    const view = make_view(doc);

    const mid_title = 2 + 3;
    const tr = view.state.tr.setSelection(
      TextSelection.create(view.state.doc, mid_title),
    );
    view.dispatch(tr);

    const handled = fire_key(view, "Backspace");
    expect(handled).toBe(false);

    expect(view.state.selection.$from.pos).toBe(mid_title);
    view.destroy();
  });
});
