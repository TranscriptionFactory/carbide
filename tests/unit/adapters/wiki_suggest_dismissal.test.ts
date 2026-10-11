/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  create_wiki_suggest_prose_plugin,
  set_wiki_suggestions,
  wiki_suggest_plugin_key,
} from "$lib/features/editor/adapters/wiki_suggest_plugin";

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = "";
});

function mount_open_suggest(): EditorView {
  const plugin = create_wiki_suggest_prose_plugin({
    on_query: vi.fn(),
    on_dismiss: vi.fn(),
    base_note_path: "source.md",
  });
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, schema.text("see [[ta")),
  ]);
  const target = document.createElement("div");
  document.body.appendChild(target);
  const v = new EditorView(target, {
    state: EditorState.create({ schema, doc, plugins: [plugin] }),
  });
  view = v;
  v.dispatch(
    v.state.tr.setSelection(TextSelection.create(doc, doc.content.size - 1)),
  );
  set_wiki_suggestions(v, [
    { title: "target", path: "target.md", kind: "existing" },
  ]);
  return v;
}

function is_active(v: EditorView): boolean {
  return wiki_suggest_plugin_key.getState(v.state)?.active ?? false;
}

function press_escape(v: EditorView) {
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    cancelable: true,
  });
  v.someProp("handleKeyDown", (f) => f(v, event));
}

describe("wiki suggest dismissal lock", () => {
  it("stays dismissed after Escape while the query is unchanged", () => {
    const v = mount_open_suggest();
    expect(is_active(v)).toBe(true);

    press_escape(v);
    v.dispatch(v.state.tr.setMeta("unrelated", true));

    expect(is_active(v)).toBe(false);
  });

  it("re-activates once the query changes", () => {
    const v = mount_open_suggest();
    press_escape(v);

    v.dispatch(v.state.tr.insertText("r"));

    expect(is_active(v)).toBe(true);
  });
});
