import { describe, expect, it } from "vitest";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import {
  map_find_options,
  map_find_range,
  resolve_find_open_state,
} from "$lib/features/editor/domain/find_scope";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
  },
  marks: {},
});

function mapping_for(
  text: string,
  edit: (tr: ReturnType<EditorState["tr"]["insertText"]>) => void,
) {
  const state = EditorState.create({
    schema,
    doc: schema.node("doc", null, [
      schema.node("paragraph", null, schema.text(text)),
    ]),
  });
  const tr = state.tr;
  edit(tr);
  return tr.mapping;
}

describe("resolve_find_open_state", () => {
  it("leaves scope on the document when nothing is selected", () => {
    expect(resolve_find_open_state(null)).toEqual({
      query: null,
      scope: "document",
      scope_range: null,
    });
  });

  it("seeds the query from a short single-line selection", () => {
    expect(
      resolve_find_open_state({ from: 4, to: 11, text: "haystack" }),
    ).toEqual({
      query: "haystack",
      scope: "document",
      scope_range: { from: 4, to: 11 },
    });
  });

  it("scopes to the selection when it spans more than one line", () => {
    expect(
      resolve_find_open_state({ from: 1, to: 40, text: "first\nsecond" }),
    ).toEqual({
      query: null,
      scope: "selection",
      scope_range: { from: 1, to: 40 },
    });
  });

  it("does not seed the query from an overlong selection", () => {
    const long_text = "x".repeat(101);
    expect(
      resolve_find_open_state({ from: 1, to: 102, text: long_text }),
    ).toEqual({
      query: null,
      scope: "document",
      scope_range: { from: 1, to: 102 },
    });
  });

  it("offers a single-line selection as a scope without turning it on", () => {
    const state = resolve_find_open_state({
      from: 4,
      to: 11,
      text: "haystack",
    });
    expect(state.scope).toBe("document");
    expect(state.scope_range).not.toBeNull();
  });

  it("treats an empty selection as no selection", () => {
    expect(resolve_find_open_state({ from: 3, to: 3, text: "" })).toEqual({
      query: null,
      scope: "document",
      scope_range: null,
    });
  });
});

describe("map_find_range", () => {
  it("shifts the range when text is inserted before it", () => {
    const mapping = mapping_for("alpha beta gamma", (tr) => {
      tr.insertText("xx", 1);
    });
    expect(map_find_range({ from: 7, to: 11 }, mapping)).toEqual({
      from: 9,
      to: 13,
    });
  });

  it("grows the range when text is inserted inside it", () => {
    const mapping = mapping_for("alpha beta gamma", (tr) => {
      tr.insertText("xx", 8);
    });
    expect(map_find_range({ from: 7, to: 11 }, mapping)).toEqual({
      from: 7,
      to: 13,
    });
  });

  it("keeps text typed against either edge outside the range", () => {
    const at_start = mapping_for("alpha beta gamma", (tr) => {
      tr.insertText("xx", 7);
    });
    expect(map_find_range({ from: 7, to: 11 }, at_start)).toEqual({
      from: 9,
      to: 13,
    });

    const at_end = mapping_for("alpha beta gamma", (tr) => {
      tr.insertText("xx", 11);
    });
    expect(map_find_range({ from: 7, to: 11 }, at_end)).toEqual({
      from: 7,
      to: 11,
    });
  });

  it("returns null when the range is deleted away", () => {
    const mapping = mapping_for("alpha beta gamma", (tr) => {
      tr.delete(7, 11);
    });
    expect(map_find_range({ from: 7, to: 11 }, mapping)).toBeNull();
  });
});

describe("map_find_options", () => {
  const base = { case_sensitive: false, whole_word: false };

  it("passes unscoped options through untouched", () => {
    const mapping = mapping_for("alpha", (tr) => {
      tr.insertText("x", 1);
    });
    expect(map_find_options(base, mapping)).toBe(base);
  });

  it("maps a surviving range", () => {
    const mapping = mapping_for("alpha beta gamma", (tr) => {
      tr.insertText("xx", 1);
    });
    expect(
      map_find_options({ ...base, range: { from: 7, to: 11 } }, mapping),
    ).toEqual({ ...base, range: { from: 9, to: 13 } });
  });

  it("drops a collapsed range so find falls back to the document", () => {
    const mapping = mapping_for("alpha beta gamma", (tr) => {
      tr.delete(7, 11);
    });
    const mapped = map_find_options(
      { ...base, range: { from: 7, to: 11 } },
      mapping,
    );
    expect(mapped).toEqual(base);
    expect(mapped.range).toBeUndefined();
  });
});
