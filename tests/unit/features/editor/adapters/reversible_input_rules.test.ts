import { describe, expect, it } from "vitest";
import {
  EditorState,
  TextSelection,
  type Plugin,
  type Transaction,
} from "prosemirror-state";
import { undoInputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import type { Node as PmNode } from "prosemirror-model";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_inline_mark_input_rules_prose_plugin } from "$lib/features/editor/adapters/inline_mark_input_rules_plugin";
import { create_block_input_rules_prose_plugin } from "$lib/features/editor/adapters/block_input_rules_plugin";

const inline_plugin = create_inline_mark_input_rules_prose_plugin();
const block_plugin = create_block_input_rules_prose_plugin();

type FakeView = {
  state: EditorState;
  composing: boolean;
  dispatch: (tr: Transaction) => void;
};

function make_state(text: string): EditorState {
  const paragraph = schema.nodes.paragraph.create(
    null,
    text ? schema.text(text) : null,
  );
  const doc = schema.nodes.doc.create(null, paragraph);
  return EditorState.create({
    doc,
    selection: TextSelection.atEnd(doc),
    plugins: [
      inline_plugin,
      block_plugin,
      keymap({ Backspace: undoInputRule }),
    ],
  });
}

function make_view(state: EditorState): FakeView {
  const view: FakeView = {
    state,
    composing: false,
    dispatch(tr) {
      view.state = view.state.apply(tr);
    },
  };
  return view;
}

function type_closing_char(plugin: Plugin, view: FakeView, char: string): void {
  const pos = view.state.selection.head;
  const handle_text_input = plugin.props.handleTextInput as (
    v: FakeView,
    from: number,
    to: number,
    text: string,
  ) => boolean;
  const handled = handle_text_input(view, pos, pos, char);
  expect(handled).toBe(true);
}

function press_backspace(view: FakeView): boolean {
  return undoInputRule(view.state, view.dispatch);
}

function first_text_node(doc: PmNode): PmNode | null {
  let found: PmNode | null = null;
  doc.descendants((node) => {
    if (found) return false;
    if (node.isText) {
      found = node;
      return false;
    }
    return true;
  });
  return found;
}

describe("reversible input rules (Backspace undoes the last input rule)", () => {
  it("reverts an inline code rule to the literal backticks", () => {
    const view = make_view(make_state("`code"));
    type_closing_char(inline_plugin, view, "`");

    const code_text = first_text_node(view.state.doc);
    expect(code_text?.text).toBe("code");
    expect(
      code_text?.marks.some((m) => m.type === schema.marks.code_inline),
    ).toBe(true);

    expect(press_backspace(view)).toBe(true);

    const reverted = first_text_node(view.state.doc);
    expect(reverted?.text).toBe("`code`");
    expect(reverted?.marks.length).toBe(0);
  });

  it("reverts a bold rule to the literal asterisks", () => {
    const view = make_view(make_state("**bold*"));
    type_closing_char(inline_plugin, view, "*");

    expect(
      first_text_node(view.state.doc)?.marks.some(
        (m) => m.type === schema.marks.strong,
      ),
    ).toBe(true);

    expect(press_backspace(view)).toBe(true);

    const reverted = first_text_node(view.state.doc);
    expect(reverted?.text).toBe("**bold**");
    expect(reverted?.marks.length).toBe(0);
  });

  it("reverts a heading block rule to the literal `# `", () => {
    const view = make_view(make_state("#"));
    type_closing_char(block_plugin, view, " ");

    expect(view.state.doc.firstChild?.type).toBe(schema.nodes.heading);

    expect(press_backspace(view)).toBe(true);

    expect(view.state.doc.firstChild?.type).toBe(schema.nodes.paragraph);
    expect(view.state.doc.firstChild?.textContent).toBe("# ");
  });

  it("falls through (returns false) when there is no input rule to undo", () => {
    const view = make_view(make_state("plain text"));
    expect(press_backspace(view)).toBe(false);
  });
});
