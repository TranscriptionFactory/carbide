/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_mark_syntax_reveal_plugin } from "$lib/features/editor/adapters/mark_syntax_reveal_plugin";

type Segment = { text: string; marks?: string[] };

let mounted: EditorView | null = null;

afterEach(() => {
  mounted?.destroy();
  mounted = null;
});

function mount(segments: Segment[], caret: number): EditorView {
  const children = segments.map((seg) =>
    schema.text(
      seg.text,
      (seg.marks ?? []).map((name) => schema.marks[name]!.create()),
    ),
  );
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, children),
  ]);
  const state = EditorState.create({
    doc,
    plugins: [create_mark_syntax_reveal_plugin()],
    selection: TextSelection.create(doc, caret),
  });
  mounted = new EditorView(document.createElement("div"), { state });
  return mounted;
}

function text_nodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
  }
  return nodes;
}

// Every offset the browser caret can rest at while walking the rendered line,
// mapped through ProseMirror's own DOM->document lookup. One arrow press moves
// the caret by exactly one entry, so this is the sequence an arrow walk visits.
function caret_stops(view: EditorView): number[] {
  const nodes = text_nodes(view.dom);
  const stops: number[] = [];
  for (const node of nodes) {
    for (let offset = 0; offset < node.data.length; offset++) {
      stops.push(view.posAtDOM(node, offset));
    }
  }
  const last = nodes[nodes.length - 1]!;
  stops.push(view.posAtDOM(last, last.data.length));
  return stops;
}

function steps(stops: number[]): number[] {
  return stops.slice(1).map((pos, i) => pos - stops[i]!);
}

function positions_of(view: EditorView): number[] {
  const block = view.state.doc.child(0);
  return Array.from({ length: block.content.size + 1 }, (_, i) => 1 + i);
}

const RUNS: Array<[string, string[], string]> = [
  ["bold", ["strong"], "**"],
  ["highlight", ["highlight"], "=="],
  ["code", ["code_inline"], "`"],
  ["bold italic", ["strong", "em"], "***"],
];

describe("arrow walk across a revealed run", () => {
  for (const [label, marks, delimiter] of RUNS) {
    it(`reaches every position of a${delimiter}mid${delimiter}b in one press per position (${label})`, () => {
      const view = mount(
        [{ text: "a" }, { text: "mid", marks }, { text: "b" }],
        4,
      );

      const stops = caret_stops(view);
      const expected = positions_of(view);

      expect(stops).toEqual(expected);
      expect(steps(stops)).toEqual(expected.slice(1).map(() => 1));
      expect(steps([...stops].reverse())).toEqual(
        expected.slice(1).map(() => -1),
      );
    });
  }

  it("renders the delimiters outside the selectable text", () => {
    const view = mount(
      [{ text: "a" }, { text: "bold", marks: ["strong"] }, { text: "b" }],
      4,
    );

    expect(view.dom.textContent).toBe("abold" + "b");
    expect(view.dom.textContent).toBe(view.state.doc.textContent);
  });

  it("keeps the walk stable with two runs revealed in the same block", () => {
    const view = mount(
      [
        { text: "a" },
        { text: "bo", marks: ["strong"] },
        { text: "c" },
        { text: "hi", marks: ["highlight"] },
        { text: "d" },
      ],
      3,
    );

    const expected = positions_of(view);
    expect(caret_stops(view)).toEqual(expected);
    expect(view.dom.textContent).toBe(view.state.doc.textContent);
  });

  it("walks a run that sits at both edges of the block", () => {
    const view = mount([{ text: "solo", marks: ["em"] }], 3);

    expect(caret_stops(view)).toEqual(positions_of(view));
    expect(view.dom.textContent).toBe("solo");
  });
});

function reveal_markers(view: EditorView) {
  return {
    open: [...view.dom.querySelectorAll(".mark-reveal-open")],
    close: [...view.dom.querySelectorAll(".mark-reveal-close")],
  };
}

describe("delimiter markup", () => {
  it("marks the first and last character of the run", () => {
    const view = mount(
      [{ text: "a" }, { text: "bold", marks: ["strong"] }, { text: "b" }],
      4,
    );

    const { open, close } = reveal_markers(view);
    expect(open.map((el) => el.textContent)).toEqual(["b"]);
    expect(close.map((el) => el.textContent)).toEqual(["d"]);
  });

  it("marks a run split across text nodes exactly once per side", () => {
    const view = mount(
      [
        { text: "plain" },
        { text: "a", marks: ["code_inline"] },
        { text: "bc", marks: ["code_inline", "strong"] },
        { text: "d", marks: ["code_inline"] },
      ],
      8,
    );

    const { open, close } = reveal_markers(view);
    expect(open.map((el) => el.textContent)).toEqual(["a", "b"]);
    expect(close.map((el) => el.textContent)).toEqual(["c", "d"]);
  });

  it("nests one wrapper per run so nested delimiters stack", () => {
    const view = mount([{ text: "hi", marks: ["strong", "em"] }], 2);

    const { open, close } = reveal_markers(view);
    expect(open).toHaveLength(2);
    expect(close).toHaveLength(2);
    expect(open[0]!.contains(open[1]!)).toBe(true);
    expect(close[0]!.contains(close[1]!)).toBe(true);
  });

  it("wraps the single character of a one-character run on both sides", () => {
    const view = mount([{ text: "x", marks: ["code_inline"] }], 1);

    const { open, close } = reveal_markers(view);
    expect(open).toHaveLength(1);
    expect(close).toHaveLength(1);
    expect(open[0]!.textContent).toBe("x");
    expect(close[0]!.textContent).toBe("x");
  });
});
