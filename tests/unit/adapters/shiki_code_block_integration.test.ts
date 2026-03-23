/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_code_block_view_prose_plugin } from "$lib/features/editor/adapters/code_block_view_plugin";
import { create_shiki_prose_plugin } from "$lib/features/editor/adapters/shiki_plugin";
import { init_highlighter } from "$lib/features/editor/adapters/shiki_highlighter";

beforeAll(() => {
  init_highlighter();
});

let active_view: EditorView | null = null;
let active_container: HTMLElement | null = null;

afterEach(() => {
  active_view?.destroy();
  active_view = null;
  active_container?.remove();
  active_container = null;
});

function create_editor(
  code: string,
  language: string,
  { with_node_view = true } = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const code_block = schema.nodes.code_block.create(
    { language },
    code.length > 0 ? schema.text(code) : [],
  );
  const doc = schema.nodes.doc.create(null, [code_block]);

  const plugins = [];
  if (with_node_view) {
    plugins.push(create_code_block_view_prose_plugin());
  }
  plugins.push(create_shiki_prose_plugin());
  const state = EditorState.create({ doc, plugins });

  const view = new EditorView(container, {
    state,
    dispatchTransaction: (tr) => {
      const new_state = view.state.apply(tr);
      view.updateState(new_state);
    },
  });

  active_view = view;
  active_container = container;
  return { view, container };
}

describe("Shiki + CodeBlockView integration", () => {
  it("applies syntax highlighting decorations inside code block NodeView", () => {
    const { container } = create_editor('const x = "hello";', "javascript");

    const code_el = container.querySelector("code")!;
    const colored_spans = code_el.querySelectorAll("span[style]");
    expect(colored_spans.length).toBeGreaterThan(0);
  });

  it("applies decorations without NodeView plugin", () => {
    const { container } = create_editor('const x = "hello";', "javascript", {
      with_node_view: false,
    });

    const code_el = container.querySelector("code")!;
    const colored_spans = code_el.querySelectorAll("span[style]");
    expect(colored_spans.length).toBeGreaterThan(0);
  });

  it("preserves decorations after height attr change", () => {
    const { view, container } = create_editor(
      'const x = "hello";',
      "javascript",
    );

    const code_el = container.querySelector("code")!;
    const before = code_el.querySelectorAll("span[style]").length;
    expect(before).toBeGreaterThan(0);

    const tr = view.state.tr.setNodeMarkup(0, undefined, {
      ...view.state.doc.child(0).attrs,
      height: 200,
    });
    view.dispatch(tr);

    const after = code_el.querySelectorAll("span[style]").length;
    expect(after).toBe(before);
  });
});
