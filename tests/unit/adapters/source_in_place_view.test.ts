/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { toggleMark } from "prosemirror-commands";
import {
  parse_markdown,
  schema,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { create_source_in_place_plugin } from "$lib/features/editor/adapters/source_in_place_plugin";
import { create_mark_syntax_reveal_plugin } from "$lib/features/editor/adapters/mark_syntax_reveal_plugin";
import { create_inline_mark_input_rules_prose_plugin } from "$lib/features/editor/adapters/inline_mark_input_rules_plugin";

let mounted: EditorView | null = null;

afterEach(() => {
  mounted?.destroy();
  mounted = null;
});

function mount(markdown: string): EditorView {
  const state = EditorState.create({
    doc: parse_markdown(markdown),
    plugins: [
      create_source_in_place_plugin(),
      create_mark_syntax_reveal_plugin(),
      create_inline_mark_input_rules_prose_plugin(),
      keymap({ "Mod-z": undo }),
      history(),
    ],
  });
  mounted = new EditorView(document.createElement("div"), { state });
  return mounted;
}

function place_caret(view: EditorView, pos: number): void {
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)),
  );
}

function text_nodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
  }
  return nodes;
}

// Every offset the browser caret can rest at in the first paragraph, mapped
// through ProseMirror's DOM->document lookup, paired with the character just
// before it.
function caret_stops(view: EditorView): Array<[number, string]> {
  const paragraph = view.dom.children[0];
  if (!paragraph) return [];
  const stops: Array<[number, string]> = [];
  for (const node of text_nodes(paragraph)) {
    for (let offset = 1; offset <= node.data.length; offset++) {
      stops.push([view.posAtDOM(node, offset), node.data.charAt(offset - 1)]);
    }
  }
  return stops;
}

describe("source-in-place in a view", () => {
  it("gives each revealed delimiter character its own caret stop", () => {
    const view = mount("**bold** after\n\ntail\n");
    place_caret(view, 5);

    expect(view.state.selection.head).toBe(9);
    expect(view.dom.children[0]?.textContent).toBe("**bold** after");
    const stops = caret_stops(view).slice(0, 8);
    expect(stops).toEqual([
      [2, "*"],
      [3, "*"],
      [4, "b"],
      [5, "o"],
      [6, "l"],
      [7, "d"],
      [8, "*"],
      [9, "*"],
    ]);
  });

  it("dims the syntax and keeps the formatted look of the content", () => {
    const view = mount("**bold** after\n\ntail\n");
    place_caret(view, 5);

    const syntax = [...view.dom.querySelectorAll(".md-source-syntax")];
    expect(syntax.map((el) => el.textContent).join("")).toBe("****");
    const strong = [...view.dom.querySelectorAll(".md-source strong")];
    expect(strong.map((el) => el.textContent).join("")).toBe("bold");
  });

  it("types source verbatim, without input rules turning it into marks", () => {
    const view = mount("**bold** after\n\ntail\n");
    place_caret(view, 5);
    place_caret(view, 8);

    const handled = view.someProp("handleTextInput", (f) =>
      f(view, 8, 8, "*", () => view.state.tr.insertText("*", 8, 8)),
    );

    expect(handled).toBe(true);
    expect(view.state.doc.child(0).textContent).toBe("**bold*** after");
    expect(
      view.state.doc
        .child(0)
        .child(0)
        .marks.map((m) => m.type.name),
    ).toEqual(["md_source"]);
  });

  it("converts source back before Mod-z so undo sees the recorded marks", () => {
    const view = mount("a bold b\n\ntail\n");
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 3, 7)),
    );
    toggleMark(schema.marks.strong)(view.state, view.dispatch);
    place_caret(view, 7);
    expect(view.state.doc.child(0).textContent).toBe("a **bold** b");

    view.dom.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }),
    );

    expect(view.state.doc.child(0).textContent).toBe("a bold b");
    let has_strong = false;
    view.state.doc.descendants((node) => {
      if (schema.marks.strong.isInSet(node.marks)) has_strong = true;
    });
    expect(has_strong).toBe(false);
  });

  it("holds conversions while an IME composition is open", () => {
    const view = mount("a **bold** b\n\ntail\n");
    view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
    place_caret(view, 7);
    expect(view.state.doc.child(0).textContent).toBe("a bold b");

    view.dom.dispatchEvent(new CompositionEvent("compositionend"));
    place_caret(view, 6);
    expect(view.state.doc.child(0).textContent).toBe("a **bold** b");
  });
});
