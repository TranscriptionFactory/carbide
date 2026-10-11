/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import { assemble_extensions } from "$lib/features/editor/extensions";
import type { PluginContext } from "$lib/features/editor/extensions/types";
import { mark_syntax_reveal_plugin_key } from "$lib/features/editor/adapters/mark_syntax_reveal_plugin";

const open_views: EditorView[] = [];

afterEach(() => {
  for (const view of open_views.splice(0)) view.destroy();
  document.body.innerHTML = "";
});

// "a" + bold "bold" + "b": the bold run spans 2..6.
function mount(syntax_reveal_enabled: boolean, caret: number): EditorView {
  const ctx: PluginContext = {
    events: { on_markdown_change: () => {}, on_dirty_state_change: () => {} },
    get_note_path: () => "note.md",
    get_vault_id: () => null,
    get_markdown: () => "",
    resolve_asset_url_for_vault: null,
    syntax_reveal_enabled,
  };
  const paragraph = schema.nodes.paragraph.create(null, [
    schema.text("a"),
    schema.text("bold", [schema.marks.strong.create()]),
    schema.text("b"),
  ]);
  const doc = schema.nodes.doc.create(null, [paragraph]);
  const assembled = assemble_extensions(ctx, {
    toolbar_visibility: "always_hide",
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const view = new EditorView(container, {
    state: EditorState.create({ schema, doc, plugins: assembled.plugins }),
  });
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, caret)),
  );
  open_views.push(view);
  return view;
}

function press_backspace(view: EditorView): boolean {
  const event = new KeyboardEvent("keydown", { key: "Backspace" });
  return Boolean(view.someProp("handleKeyDown", (f) => f(view, event)));
}

describe("syntax reveal toggle", () => {
  it("off: no reveal plugin state or decorations exist", () => {
    const view = mount(false, 4);

    expect(mark_syntax_reveal_plugin_key.getState(view.state)).toBeUndefined();
    expect(view.dom.querySelector(".mark-reveal-open")).toBeNull();
    expect(view.dom.querySelector(".mark-reveal-close")).toBeNull();
  });

  it("on: the caret inside a bold run reveals its delimiters", () => {
    const view = mount(true, 4);

    expect(
      mark_syntax_reveal_plugin_key.getState(view.state)?.spans,
    ).toHaveLength(1);
    expect(view.dom.querySelector(".mark-reveal-open")).not.toBeNull();
  });

  it("off: Backspace at a bold run start is left to default text deletion", () => {
    const view = mount(false, 2);

    expect(press_backspace(view)).toBe(false);
  });

  it("on: Backspace at a bold run start is consumed by the reveal plugin", () => {
    const view = mount(true, 2);

    expect(press_backspace(view)).toBe(true);
  });
});
