/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { DOMParser } from "prosemirror-model";
import { toggle_format } from "$lib/features/editor/adapters/formatting_toolbar_commands";
import { toggleMark } from "prosemirror-commands";
import {
  parse_markdown,
  schema,
  serialize_markdown,
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
      keymap({ "Mod-z": undo, "Mod-b": toggleMark(schema.marks.strong) }),
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

  it("normalizes revealed source before toolbar undo and redo", () => {
    const view = mount("a bold b\n\ntail\n");
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 3, 7)),
    );
    toggle_format("bold", view);
    place_caret(view, 7);
    expect(view.state.doc.child(0).textContent).toBe("a **bold** b");
    expect(toggle_format("undo", view)).toBe(true);
    expect(serialize_markdown(view.state.doc)).toBe("a bold b\n\ntail\n");
    expect(toggle_format("redo", view)).toBe(true);
    expect(serialize_markdown(view.state.doc)).toBe("a **bold** b\n\ntail\n");
  });

  it("toggles formatting on selected revealed content", () => {
    const view = mount("a **bold** b\n\ntail\n");
    place_caret(view, 7);
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 5, 9)),
    );
    expect(toggle_format("bold", view)).toBe(true);
    expect(serialize_markdown(view.state.doc)).toBe("a bold b\n\ntail\n");
  });

  it("preserves formatting when converting revealed paragraphs to headings", () => {
    const view = mount("a **bold** b\n\ntail\n");
    place_caret(view, 7);
    expect(toggle_format("heading1", view)).toBe(true);
    expect(serialize_markdown(view.state.doc)).toBe("# a **bold** b\n\ntail\n");
    expect(view.state.doc.child(0).textContent).toBe("a bold b");
  });

  it.each([
    [3, 11, "<strong>bold</strong>", "**bold**"],
    [5, 9, "bold", "bold"],
    [3, 4, "*", "*"],
  ])(
    "copies revealed source %i..%i without leaking presentation marks",
    (from, to, html, text) => {
      const view = mount("a **bold** b\n\ntail\n");
      place_caret(view, 7);
      view.dispatch(
        view.state.tr.setSelection(
          TextSelection.create(view.state.doc, from, to),
        ),
      );
      const copied = view.serializeForClipboard(view.state.selection.content());
      expect(copied.dom.innerHTML).toContain(html);
      const parsed = DOMParser.fromSchema(schema).parseSlice(copied.dom);
      expect(parsed.content.textBetween(0, parsed.content.size)).toBe(
        text === "**bold**" ? "bold" : text,
      );
      parsed.content.descendants((node) => {
        expect(schema.marks.md_source.isInSet(node.marks)).toBeUndefined();
      });
    },
  );

  it("normalizes source before keyboard formatting", () => {
    const view = mount("a **bold** b\n\ntail\n");
    place_caret(view, 7);
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 5, 9)),
    );
    view.dom.dispatchEvent(
      new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true }),
    );
    expect(serialize_markdown(view.state.doc)).toBe("a bold b\n\ntail\n");
  });

  it("pastes inline Markdown into source as literal editable text", () => {
    const view = mount("a **bold** b\n\ntail\n");
    place_caret(view, 5);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (type: string) => (type === "text/plain" ? "**x**" : ""),
      },
    });
    view.dom.dispatchEvent(event);
    expect(view.state.doc.child(0).textContent).toBe("a **bo**x**ld** b");
    expect(
      view.state.doc
        .child(0)
        .child(1)
        .marks.map((mark) => mark.type.name),
    ).toEqual(["md_source"]);
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
