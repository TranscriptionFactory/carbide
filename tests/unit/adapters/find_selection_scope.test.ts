/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  create_find_highlight_prose_plugin,
  find_highlight_plugin_key,
} from "$lib/features/editor/adapters/find_highlight_plugin";
import type {
  FindMatchesUpdate,
  FindOptions,
  FindRange,
} from "$lib/features/editor/domain/find_types";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0] as const,
      parseDOM: [{ tag: "p" }],
    },
    text: { group: "inline" },
  },
  marks: {},
});

const BASE_OPTIONS: FindOptions = {
  case_sensitive: false,
  whole_word: false,
};

let view: EditorView | null = null;

function mount(paragraphs: string[]): EditorView {
  const state = EditorState.create({
    schema,
    doc: schema.node(
      "doc",
      null,
      paragraphs.map((text) =>
        schema.node("paragraph", null, schema.text(text)),
      ),
    ),
    plugins: [create_find_highlight_prose_plugin()],
  });

  const host = document.createElement("div");
  document.body.appendChild(host);

  view = new EditorView(host, {
    state,
    dispatchTransaction(tr) {
      view?.updateState(view.state.apply(tr));
    },
  });

  return view;
}

function start_find(
  editor: EditorView,
  query: string,
  options: FindOptions,
  on_matches_change?: (update: FindMatchesUpdate) => void,
) {
  editor.dispatch(
    editor.state.tr.setMeta(find_highlight_plugin_key, {
      query,
      selected_index: 0,
      options,
      on_matches_change,
    }),
  );
}

function plugin_state(editor: EditorView) {
  const state = find_highlight_plugin_key.getState(editor.state);
  if (!state) throw new Error("find highlight plugin state missing");
  return state;
}

// Mirrors replace_all_matches exactly: reverse position order, one
// transaction, and the meta carrying the UNMAPPED options the plugin already
// holds, because the plugin maps them on arrival. An earlier version of this
// helper re-scanned tr.doc with those unmapped options — the production bug —
// and so could not have caught it.
function replace_all(editor: EditorView, replacement: string) {
  const state = plugin_state(editor);
  let tr = editor.state.tr;
  for (const match of [...state.match_positions].sort(
    (a, b) => b.from - a.from,
  )) {
    tr = tr.insertText(replacement, match.from, match.to);
  }
  tr.setMeta(find_highlight_plugin_key, {
    query: state.query,
    selected_index: 0,
    options: state.options,
  });
  editor.dispatch(tr);
}

function second_paragraph_range(editor: EditorView): FindRange {
  const first = editor.state.doc.child(0);
  const from = first.nodeSize + 1;
  return { from, to: from + editor.state.doc.child(1).content.size };
}

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = "";
});

describe("find scoped to a selection", () => {
  it("matches only inside the range", () => {
    const editor = mount(["foo one", "foo two"]);
    const range = second_paragraph_range(editor);

    start_find(editor, "foo", { ...BASE_OPTIONS, range });

    const matches = plugin_state(editor).match_positions;
    expect(matches).toHaveLength(1);
    expect(matches[0]?.from).toBe(range.from);
  });

  it("replaces every match in the document when unscoped", () => {
    const editor = mount(["foo one", "foo two"]);

    start_find(editor, "foo", BASE_OPTIONS);
    replace_all(editor, "bar");

    expect(editor.state.doc.child(0).textContent).toBe("bar one");
    expect(editor.state.doc.child(1).textContent).toBe("bar two");
  });

  it("keeps the range aligned across a replacement inside it", () => {
    const editor = mount(["foo one", "foo foo two"]);
    const range = second_paragraph_range(editor);

    start_find(editor, "foo", { ...BASE_OPTIONS, range });
    expect(plugin_state(editor).match_positions).toHaveLength(2);

    replace_all(editor, "much-longer");

    expect(editor.state.doc.child(0).textContent).toBe("foo one");
    expect(editor.state.doc.child(1).textContent).toBe(
      "much-longer much-longer two",
    );

    const mapped = plugin_state(editor).options.range;
    expect(mapped?.from).toBe(range.from);
    expect(mapped?.to).toBe(range.from + "much-longer much-longer two".length);
  });

  it("still scopes a fresh query after the range has been mapped", () => {
    const editor = mount(["two one", "two foo"]);
    const range = second_paragraph_range(editor);

    start_find(editor, "foo", { ...BASE_OPTIONS, range });
    replace_all(editor, "bar");

    const mapped = plugin_state(editor).options.range;
    start_find(editor, "two", {
      ...BASE_OPTIONS,
      ...(mapped ? { range: mapped } : {}),
    });

    expect(plugin_state(editor).match_positions).toHaveLength(1);
  });

  it("falls back to the document when the scoped text is deleted", () => {
    const on_matches_change = vi.fn();
    const editor = mount(["foo one", "foo two"]);
    const range = second_paragraph_range(editor);

    start_find(editor, "foo", { ...BASE_OPTIONS, range }, on_matches_change);
    on_matches_change.mockClear();

    editor.dispatch(editor.state.tr.delete(range.from, range.to));

    expect(plugin_state(editor).options.range).toBeUndefined();
    expect(plugin_state(editor).match_positions).toHaveLength(1);
    expect(on_matches_change).toHaveBeenCalledWith(
      expect.objectContaining({ match_count: 1, range: null }),
    );
  });

  it("searches the whole document while the scope is off", () => {
    const editor = mount(["foo one", "foo two"]);

    start_find(editor, "foo", {
      ...BASE_OPTIONS,
      scope: "document",
      range: second_paragraph_range(editor),
    });

    expect(plugin_state(editor).match_positions).toHaveLength(2);
  });

  it("keeps mapping the range while the scope is off", () => {
    const on_matches_change = vi.fn();
    const editor = mount(["foo one", "foo two"]);
    const range = second_paragraph_range(editor);

    start_find(
      editor,
      "foo",
      { ...BASE_OPTIONS, scope: "document", range },
      on_matches_change,
    );
    on_matches_change.mockClear();

    editor.dispatch(editor.state.tr.insertText("xxxx", 1));

    // Without this the stored range would still point at the pre-edit
    // positions, and turning the scope back on would cover text the user
    // never selected.
    expect(plugin_state(editor).options.range).toEqual({
      from: range.from + 4,
      to: range.to + 4,
    });
    expect(on_matches_change).toHaveBeenCalledWith(
      expect.objectContaining({
        range: { from: range.from + 4, to: range.to + 4 },
      }),
    );
  });

  it("scopes correctly when the scope is turned back on after an edit", () => {
    const editor = mount(["foo one", "foo two"]);
    const range = second_paragraph_range(editor);

    start_find(editor, "foo", { ...BASE_OPTIONS, scope: "document", range });
    editor.dispatch(editor.state.tr.insertText("xxxx", 1));

    const mapped = plugin_state(editor).options.range;
    start_find(editor, "foo", {
      ...BASE_OPTIONS,
      scope: "selection",
      ...(mapped ? { range: mapped } : {}),
    });

    const matches = plugin_state(editor).match_positions;
    expect(matches).toHaveLength(1);
    expect(matches[0]?.from).toBe(range.from + 4);
  });

  it("reports the mapped range so the store can mirror it", () => {
    const on_matches_change = vi.fn();
    const editor = mount(["foo one", "foo two"]);
    const range = second_paragraph_range(editor);

    start_find(editor, "foo", { ...BASE_OPTIONS, range }, on_matches_change);
    on_matches_change.mockClear();

    editor.dispatch(editor.state.tr.insertText("xx", 1));

    expect(on_matches_change).toHaveBeenCalledWith(
      expect.objectContaining({
        range: { from: range.from + 2, to: range.to + 2 },
      }),
    );
  });
});
