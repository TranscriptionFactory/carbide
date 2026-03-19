import { describe, it, expect } from "vitest";
import { Schema } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import {
  extract_code_fence_query,
  get_filtered_languages,
  create_code_fence_language_prose_plugin,
  code_fence_language_plugin_key,
} from "$lib/features/editor/adapters/code_fence_language_plugin";
import { POPULAR_LANGUAGES } from "$lib/features/editor/adapters/language_registry";

describe("extract_code_fence_query", () => {
  it("returns query for triple backticks at line start", () => {
    expect(extract_code_fence_query("```")).toEqual({ query: "" });
  });

  it("returns partial language after backticks", () => {
    expect(extract_code_fence_query("```py")).toEqual({ query: "py" });
  });

  it("returns full language name", () => {
    expect(extract_code_fence_query("```javascript")).toEqual({
      query: "javascript",
    });
  });

  it("returns null for fewer than three backticks", () => {
    expect(extract_code_fence_query("``")).toBeNull();
    expect(extract_code_fence_query("`")).toBeNull();
  });

  it("returns null for text before backticks", () => {
    expect(extract_code_fence_query("some text ```")).toBeNull();
  });

  it("returns null for backticks mid-word", () => {
    expect(extract_code_fence_query("hello")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extract_code_fence_query("")).toBeNull();
  });
});

describe("get_filtered_languages", () => {
  it("returns popular languages for empty query", () => {
    const result = get_filtered_languages("");
    expect(result).toEqual(POPULAR_LANGUAGES);
  });

  it("filters to matching languages", () => {
    const result = get_filtered_languages("py");
    expect(result.some((l) => l.id === "python")).toBe(true);
    expect(
      result.every(
        (l) => l.id.includes("py") || l.label.toLowerCase().includes("py"),
      ),
    ).toBe(true);
  });

  it("returns empty for non-matching query", () => {
    const result = get_filtered_languages("xyznonexistent");
    expect(result).toHaveLength(0);
  });

  it("matches case-insensitively", () => {
    const result = get_filtered_languages("RUST");
    expect(result.some((l) => l.id === "rust")).toBe(true);
  });
});

function create_test_schema() {
  return new Schema({
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
}

describe("code_fence_language_plugin state", () => {
  it("initializes with inactive state", () => {
    const test_schema = create_test_schema();
    const plugin = create_code_fence_language_prose_plugin();
    const state = EditorState.create({
      schema: test_schema,
      plugins: [plugin],
    });
    const plugin_state = code_fence_language_plugin_key.getState(state);
    expect(plugin_state).toEqual({
      active: false,
      query: "",
      from: 0,
      selected_index: 0,
    });
  });

  it("activates via meta dispatch", () => {
    const test_schema = create_test_schema();
    const plugin = create_code_fence_language_prose_plugin();
    const state = EditorState.create({
      schema: test_schema,
      plugins: [plugin],
    });
    const new_meta = {
      active: true,
      query: "py",
      from: 1,
      selected_index: 0,
    };
    const next = state.apply(
      state.tr.setMeta(code_fence_language_plugin_key, new_meta),
    );
    const plugin_state = code_fence_language_plugin_key.getState(next);
    expect(plugin_state).toEqual(new_meta);
  });

  it("deactivates via empty state meta", () => {
    const test_schema = create_test_schema();
    const plugin = create_code_fence_language_prose_plugin();
    let state = EditorState.create({
      schema: test_schema,
      plugins: [plugin],
    });
    const active_meta = {
      active: true,
      query: "js",
      from: 1,
      selected_index: 0,
    };
    state = state.apply(
      state.tr.setMeta(code_fence_language_plugin_key, active_meta),
    );
    const empty_meta = {
      active: false,
      query: "",
      from: 0,
      selected_index: 0,
    };
    state = state.apply(
      state.tr.setMeta(code_fence_language_plugin_key, empty_meta),
    );
    const plugin_state = code_fence_language_plugin_key.getState(state);
    expect(plugin_state?.active).toBe(false);
  });
});
