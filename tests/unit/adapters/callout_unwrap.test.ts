/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  unwrap_callout,
  unwrap_callout_at,
} from "$lib/features/editor/adapters/block_transforms";
import { create_callout_keymap_prose_plugin } from "$lib/features/editor/adapters/callout_keymap_plugin";
import { create_callout_view_prose_plugin } from "$lib/features/editor/adapters/callout_view_plugin";

function make_callout(title_text: string, ...body_texts: string[]) {
  const title = schema.nodes.callout_title.create(
    null,
    title_text ? schema.text(title_text) : undefined,
  );
  const body = schema.nodes.callout_body.create(
    null,
    body_texts.map((text) =>
      schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined),
    ),
  );
  return schema.nodes.callout.create(
    { callout_type: "note", foldable: false, default_folded: false },
    [title, body],
  );
}

function make_state(doc: ReturnType<typeof schema.nodes.doc.create>) {
  return EditorState.create({ doc, schema });
}

function apply(
  state: EditorState,
  run: (s: EditorState, d?: (tr: Transaction) => void) => boolean,
): { result: boolean; state: EditorState } {
  let next = state;
  const result = run(state, (tr) => {
    next = state.apply(tr);
  });
  return { result, state: next };
}

function unwrapped_json(callout: ReturnType<typeof make_callout>): unknown {
  const doc = schema.nodes.doc.create(null, [callout]);
  const { state } = apply(make_state(doc), (s, d) =>
    unwrap_callout_at(0, s, d),
  );
  return state.doc.toJSON();
}

const TITLE_START = 2;

describe("unwrap_callout_at", () => {
  it("lifts the title to a paragraph and splices every body block out", () => {
    const doc = schema.nodes.doc.create(null, [
      make_callout("Alpha", "Bravo", "Charlie"),
    ]);
    const { result, state } = apply(make_state(doc), (s, d) =>
      unwrap_callout_at(0, s, d),
    );

    expect(result).toBe(true);
    expect(state.doc.childCount).toBe(3);
    expect(state.doc.child(0).type.name).toBe("paragraph");
    expect(state.doc.child(0).textContent).toBe("Alpha");
    expect(state.doc.child(1).textContent).toBe("Bravo");
    expect(state.doc.child(2).textContent).toBe("Charlie");
  });

  it("replaces a fully empty callout with a single empty paragraph", () => {
    const doc = schema.nodes.doc.create(null, [make_callout("", "")]);
    const { result, state } = apply(make_state(doc), (s, d) =>
      unwrap_callout_at(0, s, d),
    );

    expect(result).toBe(true);
    expect(state.doc.childCount).toBe(1);
    expect(state.doc.child(0).type.name).toBe("paragraph");
    expect(state.doc.child(0).content.size).toBe(0);
  });

  it("keeps an empty title when the body still has content", () => {
    const doc = schema.nodes.doc.create(null, [make_callout("", "Bravo")]);
    const { state } = apply(make_state(doc), (s, d) =>
      unwrap_callout_at(0, s, d),
    );

    expect(state.doc.childCount).toBe(2);
    expect(state.doc.child(0).content.size).toBe(0);
    expect(state.doc.child(1).textContent).toBe("Bravo");
  });

  it("preserves non-paragraph body blocks verbatim", () => {
    const title = schema.nodes.callout_title.create(null, schema.text("Alpha"));
    const body = schema.nodes.callout_body.create(null, [
      schema.nodes.heading.create({ level: 3, id: "" }, schema.text("Bravo")),
      schema.nodes.code_block.create({ language: "ts" }, schema.text("x")),
    ]);
    const callout = schema.nodes.callout.create(
      { callout_type: "note", foldable: false, default_folded: false },
      [title, body],
    );
    const doc = schema.nodes.doc.create(null, [callout]);
    const { state } = apply(make_state(doc), (s, d) =>
      unwrap_callout_at(0, s, d),
    );

    expect(state.doc.child(1).type.name).toBe("heading");
    expect(state.doc.child(1).attrs["level"]).toBe(3);
    expect(state.doc.child(2).type.name).toBe("code_block");
    expect(state.doc.child(2).attrs["language"]).toBe("ts");
  });

  it("parks the caret at the start of the lifted title", () => {
    const doc = schema.nodes.doc.create(null, [make_callout("Alpha", "Bravo")]);
    const { state } = apply(make_state(doc), (s, d) =>
      unwrap_callout_at(0, s, d),
    );

    expect(state.selection.$from.parent.type.name).toBe("paragraph");
    expect(state.selection.from).toBe(1);
  });

  it("returns false when the position is not a callout", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text("Alpha")),
    ]);
    const { result, state } = apply(make_state(doc), (s, d) =>
      unwrap_callout_at(0, s, d),
    );

    expect(result).toBe(false);
    expect(state.doc.child(0).type.name).toBe("paragraph");
  });

  it("reports applicability without mutating when no dispatch is given", () => {
    const doc = schema.nodes.doc.create(null, [make_callout("Alpha", "Bravo")]);
    const state = make_state(doc);

    expect(unwrap_callout_at(0, state)).toBe(true);
    expect(state.doc.child(0).type.name).toBe("callout");
  });

  it("unwraps only the addressed callout when several are present", () => {
    const doc = schema.nodes.doc.create(null, [
      make_callout("Alpha", "Bravo"),
      make_callout("Delta", "Echo"),
    ]);
    const second_pos = doc.child(0).nodeSize;
    const { state } = apply(make_state(doc), (s, d) =>
      unwrap_callout_at(second_pos, s, d),
    );

    expect(state.doc.child(0).type.name).toBe("callout");
    expect(state.doc.child(1).textContent).toBe("Delta");
    expect(state.doc.child(2).textContent).toBe("Echo");
  });
});

describe("unwrap_callout (cursor)", () => {
  it("unwraps the callout containing the caret", () => {
    const doc = schema.nodes.doc.create(null, [
      make_callout("Alpha", "Bravo", "Charlie"),
    ]);
    const state = make_state(doc).apply(
      make_state(doc).tr.setSelection(TextSelection.create(doc, TITLE_START)),
    );
    const { result, state: after } = apply(state, (s, d) =>
      unwrap_callout(s, d),
    );

    expect(result).toBe(true);
    expect(after.doc.childCount).toBe(3);
    expect(after.doc.child(0).textContent).toBe("Alpha");
  });

  it("returns false when the caret is not in a callout", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text("Alpha")),
    ]);
    const state = make_state(doc).apply(
      make_state(doc).tr.setSelection(TextSelection.create(doc, 1)),
    );
    const { result } = apply(state, (s, d) => unwrap_callout(s, d));

    expect(result).toBe(false);
  });
});

describe("unwrap parity between the Backspace path and the menu path", () => {
  function backspace_doc(callout: ReturnType<typeof make_callout>) {
    const doc = schema.nodes.doc.create(null, [callout]);
    const el = document.createElement("div");
    const view = new EditorView(el, {
      state: EditorState.create({
        doc,
        schema,
        plugins: [create_callout_keymap_prose_plugin()],
      }),
    });
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, TITLE_START),
      ),
    );
    const plugin = create_callout_keymap_prose_plugin();
    const handled = plugin.props.handleKeyDown!.call(
      plugin,
      view,
      new KeyboardEvent("keydown", { key: "Backspace" }),
    );
    const json: unknown = view.state.doc.toJSON();
    view.destroy();
    return { handled, json };
  }

  it("produces an identical document for a populated callout", () => {
    const { handled, json } = backspace_doc(
      make_callout("Alpha", "Bravo", "Charlie"),
    );

    expect(handled).toBe(true);
    expect(json).toEqual(
      unwrapped_json(make_callout("Alpha", "Bravo", "Charlie")),
    );
  });

  it("produces an identical document for an empty callout", () => {
    const { handled, json } = backspace_doc(make_callout("", ""));

    expect(handled).toBe(true);
    expect(json).toEqual(unwrapped_json(make_callout("", "")));
  });
});

describe("callout NodeView remove button", () => {
  function mount_callout_view(callout: ReturnType<typeof make_callout>) {
    const doc = schema.nodes.doc.create(null, [callout]);
    const el = document.createElement("div");
    document.body.appendChild(el);
    const view = new EditorView(el, {
      state: EditorState.create({
        doc,
        schema,
        plugins: [create_callout_view_prose_plugin()],
      }),
    });
    return { view, el, cleanup: () => view.destroy() };
  }

  function open_menu(el: HTMLElement) {
    const icon = el.querySelector<HTMLElement>(".callout-block__icon");
    if (!icon) throw new Error("callout icon was not rendered");
    icon.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  function remove_button(el: HTMLElement) {
    return el.querySelector<HTMLButtonElement>(".callout-block__menu-remove");
  }

  function click_remove(el: HTMLElement) {
    const button = remove_button(el);
    if (!button) throw new Error("remove button was not rendered");
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  it("is absent until the callout menu is opened", () => {
    const { el, cleanup } = mount_callout_view(make_callout("Alpha", "Bravo"));

    expect(remove_button(el)).toBeNull();

    cleanup();
  });

  it("unwraps the callout in place when clicked", () => {
    const { view, el, cleanup } = mount_callout_view(
      make_callout("Alpha", "Bravo", "Charlie"),
    );

    open_menu(el);
    expect(remove_button(el)).not.toBeNull();
    click_remove(el);

    expect(view.state.doc.childCount).toBe(3);
    expect(view.state.doc.child(0).type.name).toBe("paragraph");
    expect(view.state.doc.child(0).textContent).toBe("Alpha");
    expect(view.state.doc.child(1).textContent).toBe("Bravo");
    expect(view.state.doc.child(2).textContent).toBe("Charlie");

    cleanup();
  });

  it("matches the Backspace path exactly", () => {
    const { view, el, cleanup } = mount_callout_view(
      make_callout("Alpha", "Bravo", "Charlie"),
    );

    open_menu(el);
    click_remove(el);
    const json: unknown = view.state.doc.toJSON();
    cleanup();

    expect(json).toEqual(
      unwrapped_json(make_callout("Alpha", "Bravo", "Charlie")),
    );
  });
});
