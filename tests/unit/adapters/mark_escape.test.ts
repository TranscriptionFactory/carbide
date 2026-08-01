import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_mark_escape_prose_plugin } from "$lib/features/editor/adapters/mark_escape_plugin";

type Segment = { text: string; marks?: string[] };

function make_state(segments: Segment[], caret: number): EditorState {
  const children = segments.map((seg) =>
    schema.text(
      seg.text,
      (seg.marks ?? []).map((name) => schema.marks[name]!.create()),
    ),
  );
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, children),
  ]);
  return EditorState.create({
    doc,
    plugins: [create_mark_escape_prose_plugin()],
    selection: TextSelection.create(doc, caret),
  });
}

function move_to(state: EditorState, pos: number): EditorState {
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, pos)),
  );
}

function typing_mark_names(state: EditorState): string[] {
  return (state.storedMarks ?? state.selection.$head.marks()).map(
    (mark) => mark.type.name,
  );
}

function press_arrow_right(state: EditorState): {
  handled: boolean;
  next: EditorState;
} {
  let next = state;
  const view = {
    get state() {
      return next;
    },
    dispatch(tr: Transaction) {
      next = next.apply(tr);
    },
  } as unknown as EditorView;
  const event = {
    key: "ArrowRight",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  } as KeyboardEvent;

  const handled = state.plugins.some((plugin) =>
    plugin.props.handleKeyDown?.call(plugin, view, event),
  );
  return { handled, next };
}

const BOLD_THEN_PLAIN: Segment[] = [
  { text: "bold", marks: ["strong"] },
  { text: "x" },
];

describe("escaping a mark by moving the caret forward", () => {
  it("stops typing in the mark once the caret rests at the run's end", () => {
    const inside = make_state(BOLD_THEN_PLAIN, 4);
    expect(typing_mark_names(inside)).toContain("strong");

    const at_end = move_to(inside, 5);
    expect(typing_mark_names(at_end)).not.toContain("strong");
  });

  it("keeps the mark while the caret is still inside the run", () => {
    const moved = move_to(make_state(BOLD_THEN_PLAIN, 2), 3);
    expect(typing_mark_names(moved)).toContain("strong");
  });

  it("keeps the mark when the caret moves backward to the run's end", () => {
    const after = make_state(BOLD_THEN_PLAIN, 6);
    expect(typing_mark_names(move_to(after, 5))).toContain("strong");
  });

  it("keeps the mark while typing at the run's end", () => {
    const at_end = make_state([{ text: "bold", marks: ["strong"] }], 5);
    const typed = at_end.apply(at_end.tr.insertText("!", 5));
    expect(typing_mark_names(typed)).toContain("strong");
    expect(typed.doc.textContent).toBe("bold!");
  });

  it("escapes every inline mark of a run at once", () => {
    const nested = make_state(
      [{ text: "hi", marks: ["strong", "em"] }, { text: "x" }],
      2,
    );
    expect(typing_mark_names(move_to(nested, 3))).toEqual([]);
  });
});

describe("escaping a mark at the end of the document", () => {
  it("consumes ArrowRight and drops the mark when the caret cannot move", () => {
    const { handled, next } = press_arrow_right(
      make_state([{ text: "bold", marks: ["strong"] }], 5),
    );

    expect(handled).toBe(true);
    expect(typing_mark_names(next)).not.toContain("strong");
    expect(next.selection.from).toBe(5);
  });

  it("leaves ArrowRight to the browser when the caret can still move", () => {
    const { handled } = press_arrow_right(make_state(BOLD_THEN_PLAIN, 5));
    expect(handled).toBe(false);
  });

  it("leaves ArrowRight alone at the document end without a mark", () => {
    const { handled } = press_arrow_right(make_state([{ text: "plain" }], 6));
    expect(handled).toBe(false);
  });
});
