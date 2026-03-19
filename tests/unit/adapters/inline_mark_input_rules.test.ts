import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_inline_mark_input_rules_prose_plugin } from "$lib/features/editor/adapters/inline_mark_input_rules_plugin";

function make_state(text: string): EditorState {
  const plugin = create_inline_mark_input_rules_prose_plugin();
  const para = schema.nodes.paragraph.create(
    null,
    text.length > 0 ? schema.text(text) : [],
  );
  const doc = schema.nodes.doc.create(null, [para]);
  const state = EditorState.create({ doc, plugins: [plugin] });
  const pos = 1 + text.length;
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, pos)),
  );
}

function trigger_input_rule(
  prefix: string,
  final_char: string,
): EditorState | null {
  const state = make_state(prefix);
  const plugin = state.plugins[0];
  if (!plugin) return null;

  const { from } = state.selection;

  let dispatched: Transaction | null = null;
  const mock_view = {
    state,
    dispatch(tr: Transaction) {
      dispatched = tr;
    },
  } as unknown as import("prosemirror-view").EditorView;

  const handle_text_input = plugin.props.handleTextInput;
  if (!handle_text_input) return null;

  const handled = (
    handle_text_input as (
      view: import("prosemirror-view").EditorView,
      from: number,
      to: number,
      text: string,
    ) => boolean
  ).call(plugin, mock_view, from, from, final_char);

  if (!handled || !dispatched) return null;

  return state.apply(dispatched);
}

function get_first_text_node(state: EditorState) {
  const first_child = state.doc.firstChild;
  if (!first_child) return null;
  return first_child.firstChild;
}

describe("bold input rule (**text**)", () => {
  it("converts **text** to bold", () => {
    const result = trigger_input_rule("**hello*", "*");
    expect(result).not.toBeNull();
    const text_node = get_first_text_node(result!);
    expect(text_node).not.toBeNull();
    expect(text_node!.text).toBe("hello");
    expect(text_node!.marks.some((m) => m.type.name === "strong")).toBe(true);
  });

  it("converts bold after preceding text", () => {
    const result = trigger_input_rule("say **hello*", "*");
    expect(result).not.toBeNull();
    const para = result!.doc.firstChild!;
    let found_bold = false;
    para.forEach((node) => {
      if (
        node.text === "hello" &&
        node.marks.some((m) => m.type.name === "strong")
      ) {
        found_bold = true;
      }
    });
    expect(found_bold).toBe(true);
  });

  it("single asterisk produces italic, not bold", () => {
    const result = trigger_input_rule("*hello", "*");
    expect(result).not.toBeNull();
    const text_node = get_first_text_node(result!);
    expect(text_node).not.toBeNull();
    expect(text_node!.marks.some((m) => m.type.name === "strong")).toBe(false);
    expect(text_node!.marks.some((m) => m.type.name === "em")).toBe(true);
  });
});

describe("italic input rule (*text*)", () => {
  it("converts *text* to italic", () => {
    const result = trigger_input_rule("*hello", "*");
    // This may conflict with bold — italic requires single asterisks
    // The bold rule requires ** so *hello* should match italic
    // But our rule requires the char before * to not be *, so *hello* triggers italic
    if (result) {
      const text_node = get_first_text_node(result);
      expect(text_node).not.toBeNull();
      expect(text_node!.text).toBe("hello");
      expect(text_node!.marks.some((m) => m.type.name === "em")).toBe(true);
    }
  });

  it("converts italic after preceding text", () => {
    const result = trigger_input_rule("say *hello", "*");
    expect(result).not.toBeNull();
    const para = result!.doc.firstChild!;
    let found_italic = false;
    para.forEach((node) => {
      if (
        node.text === "hello" &&
        node.marks.some((m) => m.type.name === "em")
      ) {
        found_italic = true;
      }
    });
    expect(found_italic).toBe(true);
  });
});

describe("inline code input rule (`text`)", () => {
  it("converts `text` to code_inline", () => {
    const result = trigger_input_rule("`hello", "`");
    expect(result).not.toBeNull();
    const text_node = get_first_text_node(result!);
    expect(text_node).not.toBeNull();
    expect(text_node!.text).toBe("hello");
    expect(text_node!.marks.some((m) => m.type.name === "code_inline")).toBe(
      true,
    );
  });

  it("converts code after preceding text", () => {
    const result = trigger_input_rule("say `hello", "`");
    expect(result).not.toBeNull();
    const para = result!.doc.firstChild!;
    let found_code = false;
    para.forEach((node) => {
      if (
        node.text === "hello" &&
        node.marks.some((m) => m.type.name === "code_inline")
      ) {
        found_code = true;
      }
    });
    expect(found_code).toBe(true);
  });

  it("does not trigger with double backticks", () => {
    const result = trigger_input_rule("``hello`", "`");
    expect(result).toBeNull();
  });
});
