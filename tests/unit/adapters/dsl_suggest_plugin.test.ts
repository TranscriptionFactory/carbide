/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { Schema } from "prosemirror-model";
import { EditorState, TextSelection, PluginKey } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  create_suggest_prose_plugin,
  type SuggestState,
} from "$lib/features/editor/adapters/suggest_plugin_factory";
import {
  create_dsl_suggest_prose_plugin,
  extract_dsl_query,
  has_active_dsl_suggest,
  set_dsl_suggestions,
} from "$lib/features/editor/adapters/dsl_suggest_plugin";
import { schema as app_schema } from "$lib/features/editor/adapters/schema";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0] as const,
      parseDOM: [{ tag: "p" }],
    },
    code_block: {
      group: "block",
      content: "text*",
      code: true,
      attrs: { language: { default: "" } },
      toDOM: () => ["pre", ["code", 0]] as const,
      parseDOM: [{ tag: "pre" }],
    },
    text: { group: "inline" },
  },
});

type Item = { label: string };

function make_plugin(key: PluginKey<SuggestState<Item>>, langs?: string[]) {
  return create_suggest_prose_plugin<Item>({
    key,
    class_name: "DslSuggestTest",
    ...(langs ? { code_block_languages: langs } : {}),
    extract: (text_before) => ({ query: text_before, from_offset: 0 }),
    render_items: () => {},
    accept: () => {},
    on_query: () => {},
    on_dismiss: () => {},
  });
}

function mount(
  language: string | null,
  key: PluginKey<SuggestState<Item>>,
  langs?: string[],
) {
  const block =
    language === null
      ? schema.node("paragraph", null, schema.text("is"))
      : schema.node("code_block", { language }, schema.text("is"));
  const doc = schema.node("doc", null, [block]);
  const state = EditorState.create({
    doc,
    plugins: [make_plugin(key, langs)],
  });
  const cursor = state.apply(
    state.tr.setSelection(TextSelection.create(doc, 3)),
  );
  const el = document.createElement("div");
  const view = new EditorView(el, { state: cursor });
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)),
  );
  const active = key.getState(view.state)?.active ?? false;
  view.destroy();
  return active;
}

describe("dsl suggest gating", () => {
  it("activates inside a code_block whose language is allowed", () => {
    const key = new PluginKey<SuggestState<Item>>("t1");
    expect(mount("query", key, ["query"])).toBe(true);
  });

  it("does not activate inside a code_block with a non-matching language", () => {
    const key = new PluginKey<SuggestState<Item>>("t2");
    expect(mount("javascript", key, ["query"])).toBe(false);
  });

  it("default config (no code_block_languages) refuses any code_block", () => {
    const key = new PluginKey<SuggestState<Item>>("t3");
    expect(mount("query", key, undefined)).toBe(false);
  });

  it("code_block-scoped config does not activate in ordinary paragraphs", () => {
    const key = new PluginKey<SuggestState<Item>>("t4");
    expect(mount(null, key, ["query"])).toBe(false);
  });

  it("default config still activates in ordinary paragraphs", () => {
    const key = new PluginKey<SuggestState<Item>>("t5");
    expect(mount(null, key, undefined)).toBe(true);
  });
});

describe("extract_dsl_query", () => {
  it("keeps the whole prefix as the provider query", () => {
    expect(extract_dsl_query("status: op").query).toBe("status: op");
  });

  it("keys dismissal on the token before the caret", () => {
    expect(extract_dsl_query("status: op")).toMatchObject({
      from_offset: 8,
      dismiss_key: "op",
    });
  });

  it("yields an empty token after whitespace", () => {
    expect(extract_dsl_query("status: ")).toMatchObject({
      from_offset: 8,
      dismiss_key: "",
    });
  });
});

describe("dsl suggest dismissal", () => {
  const TEXT = "status: op tags: x";
  let view: EditorView | null = null;
  let plugin: ReturnType<typeof create_dsl_suggest_prose_plugin> | null = null;

  afterEach(() => {
    view?.destroy();
    view = null;
    document.body.innerHTML = "";
  });

  function caret_after(v: EditorView, prefix: string) {
    v.dispatch(
      v.state.tr.setSelection(
        TextSelection.create(v.state.doc, 1 + prefix.length),
      ),
    );
  }

  function mount_open(): EditorView {
    plugin = create_dsl_suggest_prose_plugin({
      language: "query",
      on_query: vi.fn(),
      on_dismiss: vi.fn(),
    });
    const doc = app_schema.nodes.doc.create(null, [
      app_schema.nodes.code_block.create(
        { language: "query" },
        app_schema.text(TEXT),
      ),
    ]);
    const target = document.createElement("div");
    document.body.appendChild(target);
    const v = new EditorView(target, {
      state: EditorState.create({ schema: app_schema, doc, plugins: [plugin] }),
    });
    view = v;
    caret_after(v, "status: op");
    set_dsl_suggestions(v, "query", [{ label: "open", insert: "open" }], 8);
    return v;
  }

  function click_inside_editor(v: EditorView) {
    v.dom.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  }

  function press_escape(v: EditorView) {
    const event = new KeyboardEvent("keydown", { key: "Escape" });
    v.someProp("handleKeyDown", (f) => f(v, event));
  }

  function is_active(v: EditorView): boolean {
    return plugin?.getState(v.state)?.active ?? false;
  }

  it("closes on a click inside the editor", () => {
    const v = mount_open();
    expect(has_active_dsl_suggest(v.state)).toBe(true);

    click_inside_editor(v);

    expect(is_active(v)).toBe(false);
  });

  it("stays closed while the caret stays on the same token", () => {
    const v = mount_open();
    click_inside_editor(v);

    v.dispatch(v.state.tr.setMeta("unrelated", true));
    caret_after(v, "status: op");

    expect(is_active(v)).toBe(false);
  });

  it("stays closed after Escape while the caret stays on the same token", () => {
    const v = mount_open();
    press_escape(v);

    v.dispatch(v.state.tr.setMeta("unrelated", true));

    expect(is_active(v)).toBe(false);
  });

  it("re-opens when the caret moves onto a different token", () => {
    const v = mount_open();
    click_inside_editor(v);

    caret_after(v, TEXT);

    expect(is_active(v)).toBe(true);
  });
});
