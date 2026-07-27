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

function fire_key(
  view: EditorView,
  key: string,
  init: KeyboardEventInit = {},
): boolean {
  const plugin = create_callout_keymap_prose_plugin();
  const handler = plugin.props.handleKeyDown!;
  const event = new KeyboardEvent("keydown", { key, ...init });
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

function make_folded_callout_doc(title_text: string, body_text: string) {
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
    {
      callout_type: "note",
      foldable: true,
      default_folded: true,
      folded: true,
    },
    [title, body],
  );
  return schema.nodes.doc.create(null, [callout]);
}

describe("callout keymap plugin — folded section", () => {
  function in_callout(view: EditorView): boolean {
    const $pos = view.state.selection.$from;
    for (let d = $pos.depth; d >= 0; d--) {
      if ($pos.node(d).type === schema.nodes.callout) return true;
    }
    return false;
  }

  function callout_folded(view: EditorView): boolean {
    return view.state.doc.child(0).attrs["folded"] as boolean;
  }

  it("ArrowDown after folded callout skips past it without unfolding", () => {
    const view = make_view(make_folded_callout_doc("Title", "Body text"));
    const title_end = 2 + "Title".length;
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, title_end),
      ),
    );

    const handled = fire_key(view, "ArrowDown");
    expect(handled).toBe(true);
    expect(view.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(in_callout(view)).toBe(false);
    expect(callout_folded(view)).toBe(true);
    view.destroy();
  });

  it("Enter after folded callout skips past it without unfolding", () => {
    const view = make_view(make_folded_callout_doc("Title", "Body text"));
    const title_end = 2 + "Title".length;
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, title_end),
      ),
    );

    const handled = fire_key(view, "Enter");
    expect(handled).toBe(true);
    expect(view.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(in_callout(view)).toBe(false);
    expect(callout_folded(view)).toBe(true);
    view.destroy();
  });
});

function make_foldable_callout_doc(title_text: string, body_text: string) {
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
    {
      callout_type: "note",
      foldable: true,
      default_folded: false,
      folded: false,
    },
    [title, body],
  );
  return schema.nodes.doc.create(null, [callout]);
}

describe("callout keymap plugin — Mod-Enter fold toggle", () => {
  function folded(view: EditorView): boolean {
    return view.state.doc.child(0).attrs["folded"] as boolean;
  }

  function select(view: EditorView, pos: number) {
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)),
    );
  }

  it("Cmd+Enter in foldable callout body toggles fold on and off", () => {
    const view = make_view(make_foldable_callout_doc("Title", "Body text"));
    const body_para_start = 10;
    select(view, body_para_start);

    expect(fire_key(view, "Enter", { metaKey: true })).toBe(true);
    expect(folded(view)).toBe(true);

    expect(fire_key(view, "Enter", { metaKey: true })).toBe(true);
    expect(folded(view)).toBe(false);
    view.destroy();
  });

  it("Ctrl+Enter in foldable callout title toggles fold", () => {
    const view = make_view(make_foldable_callout_doc("Title", "Body text"));
    select(view, 2);

    expect(fire_key(view, "Enter", { ctrlKey: true })).toBe(true);
    expect(folded(view)).toBe(true);
    view.destroy();
  });

  it("Cmd+Enter in non-foldable callout returns false", () => {
    const view = make_view(make_callout_doc("Title", "Body text"));
    select(view, 2);

    expect(fire_key(view, "Enter", { metaKey: true })).toBe(false);
    expect(folded(view)).toBe(false);
    view.destroy();
  });

  it("Cmd+Enter outside a callout returns false", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text("Plain text")),
    ]);
    const view = make_view(doc);
    select(view, 1);

    expect(fire_key(view, "Enter", { metaKey: true })).toBe(false);
    view.destroy();
  });

  it("Cmd+Enter with extra modifiers is not handled", () => {
    const view = make_view(make_foldable_callout_doc("Title", "Body text"));
    select(view, 10);

    expect(fire_key(view, "Enter", { metaKey: true, shiftKey: true })).toBe(
      false,
    );
    expect(fire_key(view, "Enter", { metaKey: true, altKey: true })).toBe(
      false,
    );
    expect(folded(view)).toBe(false);
    view.destroy();
  });

  it("Cmd+Enter inside a code block nested in a callout defers to the code block", () => {
    const title = schema.nodes.callout_title.create(null, schema.text("Title"));
    const body = schema.nodes.callout_body.create(null, [
      schema.nodes.code_block.create({ language: "" }, schema.text("code")),
    ]);
    const callout = schema.nodes.callout.create(
      {
        callout_type: "note",
        foldable: true,
        default_folded: false,
        folded: false,
      },
      [title, body],
    );
    const view = make_view(schema.nodes.doc.create(null, [callout]));
    const code_text_start = 10;
    select(view, code_text_start);
    expect(view.state.selection.$from.parent.type.name).toBe("code_block");

    expect(fire_key(view, "Enter", { metaKey: true })).toBe(false);
    expect(folded(view)).toBe(false);
    view.destroy();
  });
});
