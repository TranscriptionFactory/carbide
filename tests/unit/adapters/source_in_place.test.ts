import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import { history, undo, undoDepth } from "prosemirror-history";
import { toggleMark } from "prosemirror-commands";
import {
  parse_markdown,
  schema,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import {
  build_source_transition,
  create_source_in_place_plugin,
  source_in_place_plugin_key,
} from "$lib/features/editor/adapters/source_in_place_plugin";
import { PRESENTATION_ONLY_META } from "$lib/features/editor/domain/presentation_only_meta";

const TAIL = "\n\ntail\n";

function make_state(markdown: string): EditorState {
  return EditorState.create({
    doc: parse_markdown(markdown),
    plugins: [create_source_in_place_plugin(), history()],
  });
}

function move_caret(state: EditorState, pos: number): EditorState {
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, pos)),
  );
}

function tail_pos(state: EditorState): number {
  return state.doc.content.size - 1;
}

function force_exit(state: EditorState): Transaction {
  const tr = build_source_transition(state, true);
  if (!tr) throw new Error("no source region to leave");
  return tr;
}

function first_text(state: EditorState): string {
  return state.doc.child(0).textContent;
}

function region(state: EditorState) {
  return source_in_place_plugin_key.getState(state)?.region;
}

function inline_shape(block: ProseNode): Array<[string, string[]]> {
  const shape: Array<[string, string[]]> = [];
  block.forEach((child) => {
    shape.push([
      child.text ?? child.type.name,
      child.marks.map((m) => m.type.name),
    ]);
  });
  return shape;
}

describe("source-in-place: entering a run", () => {
  it("swaps the run under the caret for its literal Markdown", () => {
    const state = move_caret(make_state("a **bold** b" + TAIL), 7);

    expect(first_text(state)).toBe("a **bold** b");
    expect(inline_shape(state.doc.child(0))).toEqual([
      ["a ", []],
      ["**bold**", ["md_source"]],
      [" b", []],
    ]);
    expect(region(state)).toEqual({ from: 3, to: 11 });
  });

  it("puts a caret at the run's end after the closing delimiter", () => {
    const state = move_caret(make_state("a **bold** b" + TAIL), 7);
    expect(state.selection.head).toBe(11);
  });

  it("puts a caret at the run's start before the opening delimiter", () => {
    const state = move_caret(make_state("a **bold** b" + TAIL), 3);
    expect(state.selection.head).toBe(3);
  });

  it("keeps a caret inside the run on the same character", () => {
    const state = move_caret(make_state("a **bold** b" + TAIL), 5);
    expect(state.selection.head).toBe(7);
    expect(
      state.doc.textBetween(state.selection.head - 2, state.selection.head),
    ).toBe("bo");
  });

  it("converts nested and overlapping runs as one piece of source", () => {
    const state = move_caret(make_state("x **a *b* c** y" + TAIL), 4);
    expect(inline_shape(state.doc.child(0))).toEqual([
      ["x ", []],
      ["**a *b* c**", ["md_source"]],
      [" y", []],
    ]);
  });

  it("keeps marks that span the whole run around the source text", () => {
    const state = move_caret(
      make_state("[x **b** y](https://e.org)" + TAIL),
      4,
    );
    const source = state.doc.child(0).child(1);
    expect(source.text).toBe("**b**");
    expect(source.marks.map((m) => m.type.name)).toEqual(["link", "md_source"]);
  });

  it("does not touch headings", () => {
    const state = move_caret(make_state("# a **bold** b" + TAIL), 7);
    expect(state.doc.child(0).textContent).toBe("a bold b");
  });

  it("does not touch paragraphs inside list items", () => {
    const start = make_state("- a **bold** b" + TAIL);
    let caret = 0;
    start.doc.descendants((node, pos) => {
      if (node.isText && node.text === "bold") caret = pos + 2;
    });
    const state = move_caret(start, caret);
    expect(state.doc.child(0).textContent).toBe("a bold b");
  });

  it("declines a run that contains an inline node", () => {
    const strong = [schema.marks.strong.create()];
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text("x ", strong),
      schema.nodes.image.create({ src: "a.png" }, null, strong),
      schema.text(" z", strong),
    ]);
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const start = EditorState.create({
      doc,
      plugins: [create_source_in_place_plugin()],
    });
    const state = move_caret(start, 2);

    expect(region(state)).toBeNull();
    expect(state.doc.eq(doc)).toBe(true);
  });
});

describe("source-in-place: leaving a run", () => {
  it("re-parses the block once the caret leaves it", () => {
    const original = make_state("a **bold** b" + TAIL);
    const entered = move_caret(original, 7);
    const left = move_caret(entered, tail_pos(entered));

    expect(region(left)).toBeNull();
    expect(left.doc.eq(original.doc)).toBe(true);
  });

  it("re-parses a deleted delimiter the way Obsidian does: *bold**", () => {
    let state = move_caret(make_state("a **bold** b" + TAIL), 7);
    state = state.apply(state.tr.delete(3, 4));
    expect(first_text(state)).toBe("a *bold** b");
    state = move_caret(state, tail_pos(state));

    expect(inline_shape(state.doc.child(0))).toEqual([
      ["a ", []],
      ["bold", ["em"]],
      ["* b", []],
    ]);
    expect(state.doc.child(0).eq(parse_markdown("a *bold** b").child(0))).toBe(
      true,
    );
  });

  it("selects a single delimiter character as real document text", () => {
    let state = move_caret(make_state("**bold**" + TAIL), 5);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 8, 9)),
    );
    expect(
      state.doc.textBetween(state.selection.from, state.selection.to),
    ).toBe("*");
  });

  it("keeps source that no longer forms a paragraph as literal text", () => {
    let state = move_caret(make_state("**b**" + TAIL), 1);
    state = state.apply(state.tr.insertText("- ", 1, 3));
    expect(first_text(state)).toBe("- b**");
    state = move_caret(state, tail_pos(state));

    expect(state.doc.child(0).type.name).toBe("paragraph");
    expect(inline_shape(state.doc.child(0))).toEqual([["- b**", []]]);
  });
});

const ROUND_TRIP_CORPUS = [
  "a **bold** b",
  "*em* and `code` here",
  "~~strike~~ then ==mark==",
  "x **a *b* c** y",
  "***both***",
  "[**linked**](https://e.org) tail",
  "x **a\\*b** y",
  "**bold**.",
  "_under_ score",
  "__strong__ text",
  "<u>**inside html**</u> after",
  "**a <u>b</u> c** after",
  "%%note%% then **b**",
  "**b** then %%c%%",
  "see[^1] and **b**\n\n[^1]: def",
  "two **b** and *e* runs",
];

describe("source-in-place: round trip", () => {
  for (const markdown of ROUND_TRIP_CORPUS) {
    it(`keeps the Markdown byte-identical at every caret stop: ${JSON.stringify(markdown)}`, () => {
      const original = make_state(markdown + TAIL);
      const expected = serialize_markdown(original.doc);
      const block_end = original.doc.child(0).nodeSize - 1;

      for (let pos = 1; pos <= block_end; pos++) {
        const entered = move_caret(original, pos);
        expect(serialize_markdown(entered.doc)).toBe(expected);
        const left = move_caret(entered, tail_pos(entered));
        expect(left.doc.eq(original.doc)).toBe(true);
      }
    });
  }

  it("enters at least one run in every corpus entry", () => {
    for (const markdown of ROUND_TRIP_CORPUS) {
      const original = make_state(markdown + TAIL);
      const block_end = original.doc.child(0).nodeSize - 1;
      let entered = 0;
      for (let pos = 1; pos <= block_end; pos++) {
        if (region(move_caret(original, pos))) entered++;
      }
      expect(entered, markdown).toBeGreaterThan(0);
    }
  });
});

describe("source-in-place: history", () => {
  it("adds no undo steps for caret moves", () => {
    let state = make_state("a **bold** b and *em*" + TAIL);
    for (const pos of [7, 3, tail_pos(state), 20, 1]) {
      state = move_caret(state, Math.min(pos, tail_pos(state)));
    }
    expect(undoDepth(state)).toBe(0);
  });

  it("marks every conversion as presentation-only and out of history", () => {
    const state = move_caret(make_state("a **bold** b" + TAIL), 7);
    const tr = build_source_transition(
      state.apply(
        state.tr.setSelection(TextSelection.create(state.doc, tail_pos(state))),
      ),
    );
    expect(tr).toBeNull();

    const exit = force_exit(state);
    expect(exit.getMeta("addToHistory")).toBe(false);
    expect(exit.getMeta(PRESENTATION_ONLY_META)).toBe(true);
  });

  it("undoes an edit made inside the source after the caret left", () => {
    const original = make_state("a **bold** b" + TAIL);
    let state = move_caret(original, 7);
    state = state.apply(state.tr.insertText("X", 7));
    state = move_caret(state, tail_pos(state));
    expect(first_text(state)).toBe("a boXld b");

    let undone = state;
    undo(state, (tr) => {
      undone = state.apply(tr);
    });
    expect(undone.doc.eq(original.doc)).toBe(true);
  });

  it("undoes formatting once the source is converted back first", () => {
    const original = make_state("a bold b" + TAIL);
    let state = original.apply(
      original.tr.setSelection(TextSelection.create(original.doc, 3, 7)),
    );
    toggleMark(schema.marks.strong)(state, (tr) => {
      state = state.apply(tr);
    });
    state = move_caret(state, 7);
    expect(first_text(state)).toBe("a **bold** b");

    state = state.apply(force_exit(state));
    undo(state, (tr) => {
      state = state.apply(tr);
    });
    expect(state.doc.eq(original.doc)).toBe(true);
  });
});
