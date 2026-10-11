/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_slash_command_prose_plugin } from "$lib/features/editor/adapters/slash_command_plugin";

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = "";
});

function mount(): EditorView {
  const plugin = create_slash_command_prose_plugin();
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, schema.text("intro")),
    schema.nodes.paragraph.create(null, schema.text("/ta")),
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
  return v;
}

function menu_shown(): boolean {
  return (
    document.querySelector<HTMLElement>(".SlashMenu")?.style.display === "block"
  );
}

function nudge(v: EditorView) {
  v.dispatch(v.state.tr.setMeta("unrelated", true));
}

function press(v: EditorView, key: string) {
  const event = new KeyboardEvent("keydown", { key, cancelable: true });
  v.someProp("handleKeyDown", (f) => f(v, event));
}

function click_outside_editor() {
  const outside = document.createElement("button");
  document.body.appendChild(outside);
  outside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
}

describe("slash menu dismissal", () => {
  it("stays closed after an outside click until the query changes", () => {
    const v = mount();
    expect(menu_shown()).toBe(true);

    click_outside_editor();
    expect(menu_shown()).toBe(false);

    nudge(v);
    expect(menu_shown()).toBe(false);

    v.dispatch(v.state.tr.insertText("b"));
    expect(menu_shown()).toBe(true);
  });

  it("stays closed after Escape until the query changes", () => {
    const v = mount();

    press(v, "Escape");
    expect(menu_shown()).toBe(false);

    nudge(v);
    expect(menu_shown()).toBe(false);

    v.dispatch(v.state.tr.insertText("b"));
    expect(menu_shown()).toBe(true);
  });

  it("closes when an in-editor click moves the caret off the trigger", () => {
    const v = mount();

    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 3)));

    expect(menu_shown()).toBe(false);
  });

  it("re-arms once the caret has left and returned to the trigger", () => {
    const v = mount();
    click_outside_editor();

    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 3)));
    v.dispatch(
      v.state.tr.setSelection(
        TextSelection.create(v.state.doc, v.state.doc.content.size - 1),
      ),
    );

    expect(menu_shown()).toBe(true);
  });
});
