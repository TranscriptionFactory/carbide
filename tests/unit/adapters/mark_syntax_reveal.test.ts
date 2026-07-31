import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { keymap } from "prosemirror-keymap";
import { toggleMark } from "prosemirror-commands";
import { undoInputRule } from "prosemirror-inputrules";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { create_inline_mark_input_rules_prose_plugin } from "$lib/features/editor/adapters/inline_mark_input_rules_plugin";
import {
  create_mark_syntax_reveal_plugin,
  mark_syntax_reveal_plugin_key,
  handle_reveal_backspace,
  type RevealSpan,
} from "$lib/features/editor/adapters/mark_syntax_reveal_plugin";

type Segment = { text: string; marks?: string[] };

function make_paragraph(segments: Segment[]): ProseNode {
  const children = segments.map((seg) =>
    schema.text(
      seg.text,
      (seg.marks ?? []).map((name) => schema.marks[name]!.create()),
    ),
  );
  return schema.nodes.paragraph.create(null, children);
}

function make_state(blocks: ProseNode[], anchor: number, head?: number) {
  const doc = schema.nodes.doc.create(null, blocks);
  const state = EditorState.create({
    doc,
    plugins: [create_mark_syntax_reveal_plugin()],
  });
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, anchor, head)),
  );
}

function make_marked_state(segments: Segment[], anchor: number, head?: number) {
  return make_state([make_paragraph(segments)], anchor, head);
}

function get_spans(state: EditorState): RevealSpan[] {
  return mark_syntax_reveal_plugin_key.getState(state)!.spans;
}

type DecoAttrs = { attrs: { class: string; style: string } };
type RevealDecoration = {
  from: number;
  to: number;
  class: string;
  delimiter: string;
};

function get_decorations(state: EditorState): RevealDecoration[] {
  return mark_syntax_reveal_plugin_key
    .getState(state)!
    .decorations.find()
    .map((deco) => {
      const { attrs } = deco.type as unknown as DecoAttrs;
      return {
        from: deco.from,
        to: deco.to,
        class: attrs.class,
        delimiter: attrs.style.replace(/^--mark-reveal-delimiter: "(.*)"$/, "$1"),
      };
    });
}

function open_marker(from: number, delimiter: string): RevealDecoration {
  return { from, to: from + 1, class: "mark-reveal-open", delimiter };
}

function close_marker(to: number, delimiter: string): RevealDecoration {
  return { from: to - 1, to, class: "mark-reveal-close", delimiter };
}

function run_backspace(state: EditorState): {
  handled: boolean;
  tr: Transaction | null;
} {
  let tr: Transaction | null = null;
  const handled = handle_reveal_backspace(state, (dispatched) => {
    tr = dispatched;
  });
  return { handled, tr };
}

type TestEditor = {
  readonly state: EditorState;
  dispatch: (tr: Transaction) => void;
  composing: boolean;
};

// Mirrors the production plugin order: reveal handling precedes the inline
// input rules and the undoInputRule Backspace binding it used to shadow.
function make_editor(
  segments: Segment[],
  anchor: number,
  options: { composing?: boolean } = {},
): TestEditor {
  const doc = schema.nodes.doc.create(null, [make_paragraph(segments)]);
  const initial = EditorState.create({
    doc,
    plugins: [
      create_mark_syntax_reveal_plugin(),
      create_inline_mark_input_rules_prose_plugin(),
      keymap({ Backspace: undoInputRule }),
    ],
  });
  let state = initial.apply(
    initial.tr.setSelection(TextSelection.create(initial.doc, anchor)),
  );
  return {
    get state() {
      return state;
    },
    dispatch(tr) {
      state = state.apply(tr);
    },
    composing: options.composing ?? false,
  };
}

function as_view(editor: TestEditor): EditorView {
  return editor as unknown as EditorView;
}

function type_text(editor: TestEditor, text: string): boolean {
  const { from, to } = editor.state.selection;
  const deflt = () => editor.state.tr.insertText(text, from, to);
  for (const plugin of editor.state.plugins) {
    const handled = plugin.props.handleTextInput?.call(
      plugin,
      as_view(editor),
      from,
      to,
      text,
      deflt,
    );
    if (handled) return true;
  }
  editor.dispatch(deflt());
  return false;
}

function press_backspace(editor: TestEditor): boolean {
  const event = {
    key: "Backspace",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  } as KeyboardEvent;
  for (const plugin of editor.state.plugins) {
    if (plugin.props.handleKeyDown?.call(plugin, as_view(editor), event)) {
      return true;
    }
  }
  return false;
}

function caret_mark_names(state: EditorState): string[] {
  return (state.storedMarks ?? state.selection.$head.marks()).map(
    (m) => m.type.name,
  );
}

const CODE_SEGMENTS: Segment[] = [
  { text: "a" },
  { text: "code", marks: ["code_inline"] },
  { text: "b" },
];

describe("reveal spans on selection change", () => {
  it("reveals a code span when the cursor is inside it", () => {
    const state = make_marked_state(CODE_SEGMENTS, 4);
    expect(get_spans(state)).toEqual([
      { from: 2, to: 6, mark_name: "code_inline" },
    ]);
  });

  it("keeps plugin-state identity for caret moves within the same span", () => {
    const state = make_marked_state(CODE_SEGMENTS, 3);
    const prev = mark_syntax_reveal_plugin_key.getState(state);
    const moved = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 4)),
    );
    expect(mark_syntax_reveal_plugin_key.getState(moved)).toBe(prev);
  });

  it("reveals every run in the caret's block, not only the one under it", () => {
    const segments: Segment[] = [
      { text: "a" },
      { text: "bo", marks: ["strong"] },
      { text: "c" },
      { text: "hi", marks: ["highlight"] },
    ];
    for (const caret of [1, 4, 7]) {
      expect(get_spans(make_marked_state(segments, caret))).toEqual([
        { from: 2, to: 4, mark_name: "strong" },
        { from: 5, to: 7, mark_name: "highlight" },
      ]);
    }
  });

  it("shows nothing when the cursor is in a block without runs", () => {
    const plain = make_paragraph([{ text: "plain" }]);
    const marked = make_paragraph([{ text: "code", marks: ["code_inline"] }]);
    expect(get_spans(make_state([plain, marked], 3))).toEqual([]);
  });

  it("reveals at the span start boundary", () => {
    const state = make_marked_state(CODE_SEGMENTS, 2);
    expect(get_spans(state)).toHaveLength(1);
  });

  it("reveals at the span end boundary so backspacing into it is visible", () => {
    const state = make_marked_state(CODE_SEGMENTS, 6);
    expect(get_spans(state)).toHaveLength(1);
  });

  it("clears spans when the cursor leaves the block", () => {
    const inside = make_state(
      [make_paragraph(CODE_SEGMENTS), make_paragraph([{ text: "next" }])],
      4,
    );
    expect(get_spans(inside)).toHaveLength(1);
    const outside = inside.apply(
      inside.tr.setSelection(TextSelection.create(inside.doc, 11)),
    );
    expect(get_spans(outside)).toEqual([]);
  });

  it("reveals spans touched by a non-empty selection", () => {
    const state = make_marked_state(CODE_SEGMENTS, 1, 7);
    expect(get_spans(state)).toHaveLength(1);
  });

  it("reveals spans in both blocks touched by a cross-block selection", () => {
    const block_a = make_paragraph([{ text: "one", marks: ["strong"] }]);
    const block_b = make_paragraph([{ text: "two", marks: ["em"] }]);
    const state = make_state([block_a, block_b], 2, 8);
    expect(get_spans(state).map((s) => s.mark_name)).toEqual(["strong", "em"]);
  });

  it("never reveals inside code blocks", () => {
    const code_block = schema.nodes.code_block.create(
      null,
      schema.text("let x = 1"),
    );
    const state = make_state([code_block], 3);
    expect(get_spans(state)).toEqual([]);
  });
});

describe("per-mark delimiters", () => {
  const cases: Array<[string, string]> = [
    ["strong", "**"],
    ["em", "*"],
    ["strikethrough", "~~"],
    ["highlight", "=="],
    ["code_inline", "`"],
  ];

  for (const [mark_name, delimiter] of cases) {
    it(`renders ${delimiter} for ${mark_name}`, () => {
      const state = make_marked_state([{ text: "x", marks: [mark_name] }], 1);
      expect(get_spans(state)).toEqual([{ from: 1, to: 2, mark_name }]);
      expect(get_decorations(state)).toEqual([
        open_marker(1, delimiter),
        close_marker(2, delimiter),
      ]);
    });
  }
});

describe("nested and combined marks", () => {
  it("stacks bold and italic of equal extent into *** on both sides", () => {
    const state = make_marked_state(
      [{ text: "hi", marks: ["strong", "em"] }],
      2,
    );
    expect(get_decorations(state)).toEqual([
      open_marker(1, "**"),
      open_marker(1, "*"),
      close_marker(3, "**"),
      close_marker(3, "*"),
    ]);
  });

  it("reveals inner and outer spans at their own boundaries", () => {
    const state = make_marked_state(
      [
        { text: "bo", marks: ["strong"] },
        { text: "in", marks: ["strong", "em"] },
        { text: "ld", marks: ["strong"] },
      ],
      4,
    );
    expect(get_spans(state)).toEqual([
      { from: 1, to: 7, mark_name: "strong" },
      { from: 3, to: 5, mark_name: "em" },
    ]);
    expect(get_decorations(state)).toEqual([
      open_marker(1, "**"),
      open_marker(3, "*"),
      close_marker(5, "*"),
      close_marker(7, "**"),
    ]);
  });
});

describe("decorations are display-only", () => {
  it("selection changes never modify the document", () => {
    const state = make_marked_state(CODE_SEGMENTS, 1);
    const revealed = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 4)),
    );
    expect(revealed.doc.eq(state.doc)).toBe(true);
    expect(revealed.doc.textContent).toBe("acodeb");
  });

  it("covers the run's first and last character with inline decorations", () => {
    const state = make_marked_state(CODE_SEGMENTS, 4);
    const decorations = get_decorations(state);
    expect(decorations.map((d) => [d.from, d.to])).toEqual([
      [2, 3],
      [5, 6],
    ]);
  });

  it("emits no zero-width widget decorations", () => {
    const state = make_marked_state(CODE_SEGMENTS, 4);
    expect(get_decorations(state).every((d) => d.to === d.from + 1)).toBe(true);
  });
});

function mark_names_in(doc: ProseNode): Set<string> {
  const names = new Set<string>();
  doc.descendants((node) => {
    for (const mark of node.marks) names.add(mark.type.name);
  });
  return names;
}

function text_marked_with(doc: ProseNode, mark_name: string): string {
  let text = "";
  doc.descendants((node) => {
    if (node.isText && node.marks.some((m) => m.type.name === mark_name))
      text += node.text ?? "";
  });
  return text;
}

describe("backspace at span end deletes a character", () => {
  it("leaves the mark and the caret's mark intact while typing inside bold", () => {
    const state = make_marked_state([{ text: "boldx", marks: ["strong"] }], 6);
    const { handled, tr } = run_backspace(state);
    expect(handled).toBe(false);
    expect(tr).toBeNull();

    const next = state.apply(state.tr.delete(5, 6));
    expect(next.doc.textContent).toBe("bold");
    expect(text_marked_with(next.doc, "strong")).toBe("bold");
    expect(caret_mark_names(next)).toContain("strong");
  });

  it("does not handle backspace at the span end", () => {
    const { handled, tr } = run_backspace(make_marked_state(CODE_SEGMENTS, 6));
    expect(handled).toBe(false);
    expect(tr).toBeNull();
  });

  it("does not handle backspace mid-span", () => {
    const { handled, tr } = run_backspace(make_marked_state(CODE_SEGMENTS, 4));
    expect(handled).toBe(false);
    expect(tr).toBeNull();
  });

  it("does not handle backspace with a non-empty selection", () => {
    const { handled } = run_backspace(make_marked_state(CODE_SEGMENTS, 2, 6));
    expect(handled).toBe(false);
  });

  it("does not handle backspace where several runs end at the cursor", () => {
    const state = make_marked_state(
      [
        { text: "bo", marks: ["strong"] },
        { text: "init", marks: ["strong", "em"] },
      ],
      7,
    );
    const { handled, tr } = run_backspace(state);
    expect(handled).toBe(false);
    expect(tr).toBeNull();
  });

  it("does not handle backspace at the end of a span split across text nodes", () => {
    const state = make_marked_state(
      [
        { text: "plain" },
        { text: "ab", marks: ["code_inline", "strong"] },
        { text: "cd", marks: ["code_inline"] },
      ],
      10,
    );
    const { handled, tr } = run_backspace(state);
    expect(handled).toBe(false);
    expect(tr).toBeNull();
  });

  it("ignores backspace at a run start during IME composition", () => {
    const editor = make_editor([{ text: "run", marks: ["code_inline"] }], 1, {
      composing: true,
    });

    expect(press_backspace(editor)).toBe(false);
    expect(editor.state.doc.textContent).toBe("run");
    expect(text_marked_with(editor.state.doc, "code_inline")).toBe("run");
  });

  it("restores the literal text when backspace follows an input rule", () => {
    const editor = make_editor([{ text: "**bold*" }], 8);
    expect(type_text(editor, "*")).toBe(true);
    expect(editor.state.doc.textContent).toBe("bold");
    expect(text_marked_with(editor.state.doc, "strong")).toBe("bold");

    expect(press_backspace(editor)).toBe(true);
    expect(editor.state.doc.textContent).toBe("**bold**");
    expect(mark_names_in(editor.state.doc).has("strong")).toBe(false);
  });
});

describe("backspace at span start removes the mark", () => {
  it("removes code_inline from the whole span and orphans the trailing delimiter", () => {
    const state = make_marked_state(CODE_SEGMENTS, 2);
    const { handled, tr } = run_backspace(state);
    expect(handled).toBe(true);
    const next = state.apply(tr!);
    expect(next.doc.textContent).toBe("acode`b");
    expect(mark_names_in(next.doc).has("code_inline")).toBe(false);
  });

  it("leaves the caret where the leading delimiter was", () => {
    const state = make_marked_state(CODE_SEGMENTS, 2);
    const { tr } = run_backspace(state);
    expect(state.apply(tr!).selection.from).toBe(2);
  });

  it("handles a span that starts the block, before block joining", () => {
    const state = make_marked_state(
      [{ text: "bold", marks: ["strong"] }, { text: " tail" }],
      1,
    );
    const { handled, tr } = run_backspace(state);
    expect(handled).toBe(true);
    const next = state.apply(tr!);
    expect(next.doc.textContent).toBe("bold** tail");
    expect(mark_names_in(next.doc).has("strong")).toBe(false);
  });

  it("removes only the innermost mark when several start at the cursor", () => {
    const state = make_marked_state(
      [
        { text: "init", marks: ["strong", "em"] },
        { text: "bo", marks: ["strong"] },
      ],
      1,
    );
    const { handled, tr } = run_backspace(state);
    expect(handled).toBe(true);
    const next = state.apply(tr!);
    expect(next.doc.textContent).toBe("init*bo");
    expect(mark_names_in(next.doc).has("em")).toBe(false);
    expect(text_marked_with(next.doc, "strong")).toBe("init*bo");
  });

  it("survives a markdown round trip as literal text", () => {
    const state = make_marked_state(CODE_SEGMENTS, 2);
    const { tr } = run_backspace(state);
    const doc = state.apply(tr!).doc;
    const reparsed = parse_markdown(serialize_markdown(doc));
    expect(reparsed.textContent).toBe("acode`b");
    expect(mark_names_in(reparsed).has("code_inline")).toBe(false);
  });

  it("unwraps the starting run when one span ends where another starts", () => {
    const state = make_marked_state(
      [
        { text: "hi", marks: ["strong"] },
        { text: "there", marks: ["highlight"] },
      ],
      3,
    );
    const { handled, tr } = run_backspace(state);
    expect(handled).toBe(true);
    const next = state.apply(tr!);
    expect(next.doc.textContent).toBe("hithere==");
    expect(mark_names_in(next.doc).has("highlight")).toBe(false);
    expect(text_marked_with(next.doc, "strong")).toBe("hi");
  });
});

describe("typing the closing delimiter exits the run", () => {
  const single_character: Array<[string, string]> = [
    ["em", "*"],
    ["code_inline", "`"],
  ];

  for (const [mark_name, delimiter] of single_character) {
    it(`exits ${mark_name} on a single ${delimiter}`, () => {
      const editor = make_editor([{ text: "run", marks: [mark_name] }], 4);

      expect(type_text(editor, delimiter)).toBe(true);
      expect(editor.state.doc.textContent).toBe("run");
      expect(text_marked_with(editor.state.doc, mark_name)).toBe("run");
      expect(caret_mark_names(editor.state)).not.toContain(mark_name);
    });
  }

  const two_character: Array<[string, string]> = [
    ["strong", "*"],
    ["strikethrough", "~"],
    ["highlight", "="],
  ];

  for (const [mark_name, half] of two_character) {
    it(`exits ${mark_name} once a second ${half} completes the pair`, () => {
      const editor = make_editor([{ text: "run", marks: [mark_name] }], 4);

      expect(type_text(editor, half)).toBe(false);
      expect(editor.state.doc.textContent).toBe(`run${half}`);
      expect(text_marked_with(editor.state.doc, mark_name)).toBe(`run${half}`);

      expect(type_text(editor, half)).toBe(true);
      expect(editor.state.doc.textContent).toBe("run");
      expect(text_marked_with(editor.state.doc, mark_name)).toBe("run");
      expect(caret_mark_names(editor.state)).not.toContain(mark_name);
    });
  }

  it("keeps the run when a literal * is typed mid-run", () => {
    const editor = make_editor([{ text: "bold", marks: ["strong"] }], 3);

    expect(type_text(editor, "*")).toBe(false);
    expect(editor.state.doc.textContent).toBe("bo*ld");
    expect(text_marked_with(editor.state.doc, "strong")).toBe("bo*ld");
    expect(caret_mark_names(editor.state)).toContain("strong");
  });

  it("inserts the delimiter literally during IME composition", () => {
    const editor = make_editor([{ text: "run", marks: ["code_inline"] }], 4, {
      composing: true,
    });

    expect(type_text(editor, "`")).toBe(false);
    expect(editor.state.doc.textContent).toBe("run`");
    expect(text_marked_with(editor.state.doc, "code_inline")).toBe("run`");
  });

  it("leaves no delimiters behind after a bold hotkey round trip", () => {
    const editor = make_editor([{ text: "hi" }], 3);
    const strong = schema.marks.strong;

    toggleMark(strong)(editor.state, editor.dispatch);
    type_text(editor, "b");
    toggleMark(strong)(editor.state, editor.dispatch);
    type_text(editor, "c");

    expect(editor.state.doc.textContent).toBe("hibc");
    expect(text_marked_with(editor.state.doc, "strong")).toBe("b");
  });
});
