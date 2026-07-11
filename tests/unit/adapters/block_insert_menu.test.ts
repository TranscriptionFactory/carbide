/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/markdown_pipeline";
import { create_commands } from "$lib/features/editor/adapters/slash_command_plugin";
import {
  block_insert_commands,
  create_block_insert_menu,
} from "$lib/features/editor/adapters/block_insert_menu";
import {
  insert_paragraph_below,
  remove_empty_placeholder,
} from "$lib/features/editor/adapters/block_drag_handle_plugin";

function make_mock_view(initial: EditorState): {
  view: EditorView;
  get_state: () => EditorState;
} {
  let current = initial;
  const dom = document.createElement("div");
  document.body.appendChild(dom);
  const view = {
    get state() {
      return current;
    },
    dispatch(tr: import("prosemirror-state").Transaction) {
      current = current.apply(tr);
    },
    focus: vi.fn(),
    dom,
  } as unknown as EditorView;
  return { view, get_state: () => current };
}

function find_command(id: string) {
  const cmd = create_commands().find((c) => c.id === id);
  if (!cmd) throw new Error(`command "${id}" not found`);
  return cmd;
}

function paragraph_start(doc: import("prosemirror-model").Node): number {
  let pos = 0;
  doc.forEach((node, offset) => {
    if (node.type.name === "paragraph") pos = offset;
  });
  return pos;
}

describe("block_insert_commands", () => {
  it("sources its command list from create_commands", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text("x")),
    ]);
    const state = EditorState.create({ doc });

    const ids = block_insert_commands(state).map((c) => c.id);
    const expected = create_commands()
      .filter((c) => !c.is_available || c.is_available(state))
      .map((c) => c.id);

    expect(ids).toEqual(expected);
    expect(ids).toContain("h1");
    expect(ids).toContain("frontmatter");
  });

  it("omits commands unavailable in the current state", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.frontmatter.create(null),
      schema.nodes.paragraph.create(null, schema.text("x")),
    ]);
    const state = EditorState.create({ doc });

    expect(block_insert_commands(state).map((c) => c.id)).not.toContain(
      "frontmatter",
    );
  });
});

describe("remove_empty_placeholder", () => {
  function make_doc() {
    return schema.nodes.doc.create(null, [
      schema.nodes.heading.create({ level: 1 }, schema.text("Title")),
      schema.nodes.paragraph.create(null, schema.text("body")),
    ]);
  }

  it("deletes an untouched empty placeholder and restores selection", () => {
    const doc = make_doc();
    const initial = EditorState.create({ doc });
    const { view, get_state } = make_mock_view(
      initial.apply(
        initial.tr.setSelection(TextSelection.create(initial.doc, 1)),
      ),
    );
    const prev_selection = view.state.selection.getBookmark();
    const original = get_state().doc;

    const from = insert_paragraph_below(view, paragraph_start(doc));
    if (from == null) throw new Error("expected an inserted paragraph");

    remove_empty_placeholder(view, from, prev_selection);

    expect(get_state().doc.eq(original)).toBe(true);
    expect(get_state().selection.from).toBe(1);
  });

  it("keeps a placeholder the user typed into", () => {
    const doc = make_doc();
    const { view, get_state } = make_mock_view(EditorState.create({ doc }));
    const prev_selection = view.state.selection.getBookmark();

    const from = insert_paragraph_below(view, paragraph_start(doc));
    if (from == null) throw new Error("expected an inserted paragraph");

    view.dispatch(view.state.tr.insertText("hi", from));
    const typed_doc = get_state().doc;

    remove_empty_placeholder(view, from, prev_selection);

    expect(get_state().doc.eq(typed_doc)).toBe(true);
  });

  it("bails when the editor DOM is disconnected", () => {
    const doc = make_doc();
    const { view, get_state } = make_mock_view(EditorState.create({ doc }));
    const prev_selection = view.state.selection.getBookmark();

    const from = insert_paragraph_below(view, paragraph_start(doc));
    if (from == null) throw new Error("expected an inserted paragraph");
    const with_placeholder = get_state().doc;

    view.dom.remove();
    remove_empty_placeholder(view, from, prev_selection);

    expect(get_state().doc.eq(with_placeholder)).toBe(true);
  });
});

describe("block insert menu dismiss callback", () => {
  it("fires the dismiss callback on close without accept", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text("x")),
    ]);
    const { view } = make_mock_view(EditorState.create({ doc }));
    const menu = create_block_insert_menu(view);
    const on_dismiss = vi.fn();

    menu.open(new DOMRect(0, 0, 10, 10), 1, on_dismiss);
    menu.destroy();

    expect(on_dismiss).toHaveBeenCalledTimes(1);
  });

  it("does not fire the dismiss callback when a command is accepted", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.heading.create({ level: 1 }, schema.text("Title")),
      schema.nodes.paragraph.create(null, schema.text("body")),
    ]);
    const { view } = make_mock_view(EditorState.create({ doc }));
    const menu = create_block_insert_menu(view);
    const on_dismiss = vi.fn();

    const from = insert_paragraph_below(view, paragraph_start(doc));
    if (from == null) throw new Error("expected an inserted paragraph");

    menu.open(new DOMRect(0, 0, 10, 10), from, on_dismiss);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    menu.destroy();

    expect(on_dismiss).not.toHaveBeenCalled();
  });
});

describe("block insert flow", () => {
  it("selecting a heading command converts the newly inserted block", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.heading.create({ level: 1 }, schema.text("Title")),
      schema.nodes.paragraph.create(null, schema.text("body")),
    ]);
    const { view, get_state } = make_mock_view(EditorState.create({ doc }));

    const from = insert_paragraph_below(view, paragraph_start(doc));
    expect(from).not.toBeNull();
    if (from == null) throw new Error("expected an inserted paragraph");

    expect(get_state().doc.resolve(from).parent.type.name).toBe("paragraph");

    find_command("h1").insert(view, from);

    const parent = get_state().doc.resolve(from).parent;
    expect(parent.type.name).toBe("heading");
    expect(parent.attrs["level"]).toBe(1);
  });
});
