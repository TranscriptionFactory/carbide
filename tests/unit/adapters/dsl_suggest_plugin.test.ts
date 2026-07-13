/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { Schema } from "prosemirror-model";
import { EditorState, TextSelection, PluginKey } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  create_suggest_prose_plugin,
  type SuggestState,
} from "$lib/features/editor/adapters/suggest_plugin_factory";

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
