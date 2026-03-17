import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState } from "@milkdown/kit/prose/state";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import {
  create_find_highlight_prose_plugin,
  find_highlight_plugin_key,
} from "$lib/features/editor/adapters/find_highlight_plugin";

function create_simple_schema() {
  const doc = { content: "block+" } as const;
  const text = { group: "inline" } as const;
  const paragraph = {
    group: "block",
    content: "inline*",
    toDOM: () => ["p", 0] as const,
    parseDOM: [{ tag: "p" }],
  } as const;

  return new Schema({
    nodes: { doc, paragraph, text },
    marks: {},
  });
}

function create_doc_with_paragraphs(
  schema: Schema,
  texts: string[],
): ProseNode {
  return schema.node(
    "doc",
    null,
    texts.map((text) =>
      text
        ? schema.node("paragraph", null, schema.text(text))
        : schema.node("paragraph"),
    ),
  );
}

function state_with_query(
  schema: Schema,
  texts: string[],
  query: string,
  selected_index = 0,
): EditorState {
  const plugin = create_find_highlight_prose_plugin();
  const doc = create_doc_with_paragraphs(schema, texts);
  const state = EditorState.create({ schema, doc, plugins: [plugin] });
  const tr = state.tr.setMeta(find_highlight_plugin_key, {
    query,
    selected_index,
  });
  return state.apply(tr);
}

function simulate_replace_at(
  state: EditorState,
  match_index: number,
  replacement: string,
): EditorState {
  const plugin_state = find_highlight_plugin_key.getState(state);
  if (!plugin_state?.match_positions.length) return state;
  const match = plugin_state.match_positions[match_index];
  if (!match) return state;
  return state.apply(state.tr.insertText(replacement, match.from, match.to));
}

function simulate_replace_all(
  state: EditorState,
  replacement: string,
): EditorState {
  const plugin_state = find_highlight_plugin_key.getState(state);
  if (!plugin_state?.match_positions.length) return state;
  const sorted = [...plugin_state.match_positions].sort(
    (a, b) => b.from - a.from,
  );
  let tr = state.tr;
  for (const match of sorted) {
    tr = tr.insertText(replacement, match.from, match.to);
  }
  return state.apply(tr);
}

function doc_text(state: EditorState): string {
  return state.doc.textContent;
}

describe("replace_at_match", () => {
  it("replaces first match when multiple matches exist", () => {
    const schema = create_simple_schema();
    const state = state_with_query(schema, ["foo bar foo"], "foo");
    const plugin_state = find_highlight_plugin_key.getState(state);
    expect(plugin_state?.match_positions).toHaveLength(2);

    const next = simulate_replace_at(state, 0, "baz");
    expect(doc_text(next)).toBe("baz bar foo");
  });

  it("replaces second match at correct position", () => {
    const schema = create_simple_schema();
    const state = state_with_query(schema, ["foo bar foo"], "foo");

    const next = simulate_replace_at(state, 1, "qux");
    expect(doc_text(next)).toBe("foo bar qux");
  });

  it("replaces match with empty string (deletion)", () => {
    const schema = create_simple_schema();
    const state = state_with_query(schema, ["hello world"], "world");

    const next = simulate_replace_at(state, 0, "");
    expect(doc_text(next)).toBe("hello ");
  });

  it("does nothing when match_index is out of bounds", () => {
    const schema = create_simple_schema();
    const state = state_with_query(schema, ["hello world"], "world");

    const next = simulate_replace_at(state, 5, "replacement");
    expect(doc_text(next)).toBe("hello world");
  });
});

describe("replace_all_matches", () => {
  it("replaces all matches in document", () => {
    const schema = create_simple_schema();
    const state = state_with_query(schema, ["foo bar foo"], "foo");

    const next = simulate_replace_all(state, "baz");
    expect(doc_text(next)).toBe("baz bar baz");
  });

  it("replaces matches across multiple paragraphs", () => {
    const schema = create_simple_schema();
    const state = state_with_query(
      schema,
      ["hello world", "world here"],
      "world",
    );
    const plugin_state = find_highlight_plugin_key.getState(state);
    expect(plugin_state?.match_positions).toHaveLength(2);

    const next = simulate_replace_all(state, "earth");
    expect(doc_text(next)).toBe("hello earthearth here");
  });

  it("replaces all matches with empty string (deletion)", () => {
    const schema = create_simple_schema();
    const state = state_with_query(schema, ["test test test"], "test");

    const next = simulate_replace_all(state, "");
    expect(doc_text(next)).toBe("  ");
  });

  it("does nothing when no matches", () => {
    const schema = create_simple_schema();
    const state = state_with_query(schema, ["hello world"], "nonexistent");

    const next = simulate_replace_all(state, "replacement");
    expect(doc_text(next)).toBe("hello world");
  });

  it("processes matches in reverse order to preserve positions", () => {
    const schema = create_simple_schema();
    const state = state_with_query(schema, ["aaa"], "a");
    const plugin_state = find_highlight_plugin_key.getState(state);
    expect(plugin_state?.match_positions).toHaveLength(3);

    const next = simulate_replace_all(state, "bb");
    expect(doc_text(next)).toBe("bbbbbb");
  });
});
