import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
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

function get_widget_keys(state: EditorState): string[] {
  const decorations =
    mark_syntax_reveal_plugin_key.getState(state)!.decorations;
  return decorations
    .find()
    .map((deco) => (deco.spec as { key: string }).key)
    .sort();
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

const CODE_SEGMENTS: Segment[] = [
  { text: "a" },
  { text: "code", marks: ["code_inline"] },
  { text: "b" },
];

describe("reveal spans on selection change", () => {
  it("reveals a code span when the cursor is inside it", () => {
    const state = make_marked_state(CODE_SEGMENTS, 4);
    expect(get_spans(state)).toEqual([
      { from: 2, to: 6, mark_name: "code_inline", delimiter: "`", order: 4 },
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

  it("shows nothing when the cursor does not touch a span", () => {
    expect(get_spans(make_marked_state(CODE_SEGMENTS, 1))).toEqual([]);
    expect(get_spans(make_marked_state(CODE_SEGMENTS, 7))).toEqual([]);
  });

  it("reveals at the span start boundary", () => {
    const state = make_marked_state(CODE_SEGMENTS, 2);
    expect(get_spans(state)).toHaveLength(1);
  });

  it("reveals at the span end boundary so backspacing into it is visible", () => {
    const state = make_marked_state(CODE_SEGMENTS, 6);
    expect(get_spans(state)).toHaveLength(1);
  });

  it("clears spans when the cursor leaves the span", () => {
    const inside = make_marked_state(CODE_SEGMENTS, 4);
    expect(get_spans(inside)).toHaveLength(1);
    const outside = inside.apply(
      inside.tr.setSelection(TextSelection.create(inside.doc, 7)),
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
  const cases: Array<[string, string, number]> = [
    ["strong", "**", 0],
    ["em", "*", 1],
    ["strikethrough", "~~", 2],
    ["highlight", "==", 3],
    ["code_inline", "`", 4],
  ];

  for (const [mark_name, delimiter, order] of cases) {
    it(`renders ${delimiter} for ${mark_name}`, () => {
      const state = make_marked_state([{ text: "x", marks: [mark_name] }], 1);
      expect(get_spans(state)).toEqual([
        { from: 1, to: 2, mark_name, delimiter, order },
      ]);
      expect(get_widget_keys(state)).toEqual([
        `reveal-end:${delimiter}`,
        `reveal-start:${delimiter}`,
      ]);
    });
  }
});

describe("nested and combined marks", () => {
  it("composes bold+italic of equal extent as *** on both sides", () => {
    const state = make_marked_state(
      [{ text: "hi", marks: ["strong", "em"] }],
      2,
    );
    expect(get_widget_keys(state)).toEqual([
      "reveal-end:***",
      "reveal-start:***",
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
      { from: 1, to: 7, mark_name: "strong", delimiter: "**", order: 0 },
      { from: 3, to: 5, mark_name: "em", delimiter: "*", order: 1 },
    ]);
    expect(get_widget_keys(state)).toEqual([
      "reveal-end:*",
      "reveal-end:**",
      "reveal-start:*",
      "reveal-start:**",
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

  it("start and end widgets sit exactly at the span boundaries", () => {
    const state = make_marked_state(CODE_SEGMENTS, 4);
    const decorations = mark_syntax_reveal_plugin_key
      .getState(state)!
      .decorations.find();
    expect(decorations.map((d) => [d.from, d.to])).toEqual(
      expect.arrayContaining([
        [2, 2],
        [6, 6],
      ]),
    );
    expect(decorations).toHaveLength(2);
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

describe("backspace at span end removes the mark", () => {
  it("removes code_inline from the whole span and orphans the leading delimiter", () => {
    const state = make_marked_state(CODE_SEGMENTS, 6);
    const { handled, tr } = run_backspace(state);
    expect(handled).toBe(true);
    const next = state.apply(tr!);
    expect(next.doc.textContent).toBe("a`codeb");
    expect(mark_names_in(next.doc).has("code_inline")).toBe(false);
  });

  it("keeps the caret after the text it just unmarked", () => {
    const state = make_marked_state(CODE_SEGMENTS, 6);
    const { tr } = run_backspace(state);
    expect(state.apply(tr!).selection.from).toBe(7);
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

  it("removes only the innermost mark when several end at the cursor", () => {
    const state = make_marked_state(
      [
        { text: "bo", marks: ["strong"] },
        { text: "init", marks: ["strong", "em"] },
      ],
      7,
    );
    const { handled, tr } = run_backspace(state);
    expect(handled).toBe(true);
    const next = state.apply(tr!);
    expect(next.doc.textContent).toBe("bo*init");
    expect(mark_names_in(next.doc).has("em")).toBe(false);
    expect(text_marked_with(next.doc, "strong")).toBe("bo*init");
  });

  it("removes the full run even when the span is split across text nodes", () => {
    const state = make_marked_state(
      [
        { text: "plain" },
        { text: "ab", marks: ["code_inline", "strong"] },
        { text: "cd", marks: ["code_inline"] },
      ],
      10,
    );
    const { handled, tr } = run_backspace(state);
    expect(handled).toBe(true);
    const next = state.apply(tr!);
    expect(next.doc.textContent).toBe("plain`abcd");
    expect(mark_names_in(next.doc).has("code_inline")).toBe(false);
    expect(text_marked_with(next.doc, "strong")).toBe("ab");
  });

  it("produces one undoable transaction and clears the stored mark", () => {
    const state = make_marked_state(CODE_SEGMENTS, 6);
    const { tr } = run_backspace(state);
    expect(tr!.steps).toHaveLength(2);
    expect(tr!.getMeta("addToHistory")).toBeUndefined();
    const next = state.apply(tr!);
    expect(
      next.storedMarks?.some((m) => m.type.name === "code_inline") ?? false,
    ).toBe(false);
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

  it("prefers the ending run when one span ends where another starts", () => {
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
    expect(next.doc.textContent).toBe("**hithere");
    expect(mark_names_in(next.doc).has("strong")).toBe(false);
    expect(text_marked_with(next.doc, "highlight")).toBe("there");
  });
});
