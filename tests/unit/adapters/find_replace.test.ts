import { describe, it, expect } from "vitest";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import {
  create_find_highlight_prose_plugin,
  find_highlight_plugin_key,
} from "$lib/features/editor/adapters/find_highlight_plugin";
import { find_literal_matches_in_doc } from "$lib/features/editor/domain/find_literal_matcher";
import { next_active_index_after_replacement } from "$lib/features/editor/domain/find_active_index";
import { DEFAULT_FIND_OPTIONS } from "$lib/features/editor/domain/find_types";
import { TextSelection } from "prosemirror-state";

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
  options = DEFAULT_FIND_OPTIONS,
): EditorState {
  const plugin = create_find_highlight_prose_plugin();
  const doc = create_doc_with_paragraphs(schema, texts);
  const state = EditorState.create({ schema, doc, plugins: [plugin] });
  const tr = state.tr.setMeta(find_highlight_plugin_key, {
    query,
    selected_index,
    options,
  });
  return state.apply(tr);
}

function simulate_replace_with_advance(
  state: EditorState,
  match_index: number,
  replacement: string,
): { state: EditorState; selected_index: number } {
  const plugin_state = find_highlight_plugin_key.getState(state);
  if (!plugin_state?.match_positions.length) {
    return { state, selected_index: 0 };
  }
  const match = plugin_state.match_positions[match_index];
  if (!match) return { state, selected_index: 0 };

  const tr = state.tr.insertText(replacement, match.from, match.to);
  const next_matches = find_literal_matches_in_doc(
    tr.doc,
    plugin_state.query,
    plugin_state.options,
  );
  const next_index = next_active_index_after_replacement(
    next_matches,
    match.from,
    replacement.length,
  );
  tr.setMeta(find_highlight_plugin_key, {
    query: plugin_state.query,
    selected_index: next_index,
    options: plugin_state.options,
  });
  const next_match = next_matches[next_index];
  if (next_match) {
    tr.setSelection(
      TextSelection.create(tr.doc, next_match.from, next_match.to),
    );
  }
  return { state: state.apply(tr), selected_index: next_index };
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

describe("find options", () => {
  it("case-insensitive find (default) matches all casings", () => {
    const schema = create_simple_schema();
    const state = state_with_query(schema, ["Foo foo FOO"], "foo");
    const plugin_state = find_highlight_plugin_key.getState(state);
    expect(plugin_state?.match_positions).toHaveLength(3);
  });

  it("case-sensitive find matches only exact casing", () => {
    const schema = create_simple_schema();
    const state = state_with_query(schema, ["Foo foo FOO"], "foo", 0, {
      case_sensitive: true,
      whole_word: false,
    });
    const plugin_state = find_highlight_plugin_key.getState(state);
    expect(plugin_state?.match_positions).toHaveLength(1);
  });

  it("whole-word find excludes substring matches", () => {
    const schema = create_simple_schema();
    const state = state_with_query(
      schema,
      ["cat catalog cat_cat cat."],
      "cat",
      0,
      {
        case_sensitive: false,
        whole_word: true,
      },
    );
    const plugin_state = find_highlight_plugin_key.getState(state);
    expect(plugin_state?.match_positions).toHaveLength(2);
  });

  it("re-scans with stored options when the document changes", () => {
    const schema = create_simple_schema();
    const state = state_with_query(schema, ["Foo"], "foo", 0, {
      case_sensitive: true,
      whole_word: false,
    });
    expect(
      find_highlight_plugin_key.getState(state)?.match_positions,
    ).toHaveLength(0);

    const next = state.apply(state.tr.insertText(" foo", 4));
    const plugin_state = find_highlight_plugin_key.getState(next);
    expect(plugin_state?.match_positions).toHaveLength(1);
  });
});

describe("post-replace cursor", () => {
  it("advances the selection to the next real match", () => {
    const schema = create_simple_schema();
    const state = state_with_query(schema, ["foo bar foo baz foo"], "foo");

    const { state: next, selected_index } = simulate_replace_with_advance(
      state,
      0,
      "qux",
    );
    expect(doc_text(next)).toBe("qux bar foo baz foo");
    expect(selected_index).toBe(0);
    const positions = find_highlight_plugin_key.getState(next)?.match_positions;
    const active = positions?.[selected_index];
    expect(active && next.doc.textBetween(active.from, active.to)).toBe("foo");
  });

  it("wraps to the first match after replacing the last one", () => {
    const schema = create_simple_schema();
    const state = state_with_query(schema, ["foo foo foo"], "foo", 2);

    const { state: next, selected_index } = simulate_replace_with_advance(
      state,
      2,
      "end",
    );
    expect(doc_text(next)).toBe("foo foo end");
    expect(selected_index).toBe(0);
  });

  it("does not leave the cursor inside the replacement text", () => {
    const schema = create_simple_schema();
    const state = state_with_query(schema, ["foo foo"], "foo");

    const { state: next } = simulate_replace_with_advance(state, 0, "replaced");
    const positions = find_highlight_plugin_key.getState(next)?.match_positions;
    expect(positions).toHaveLength(1);
    const active = positions?.[0];
    expect(active && next.doc.textBetween(active.from, active.to)).toBe("foo");
  });
});
