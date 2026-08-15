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
import type { FindMatchesUpdate } from "$lib/features/editor/domain/find_types";

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

let view: EditorView | null = null;

function mount(text: string): EditorView {
  const state = EditorState.create({
    schema,
    doc: schema.node("doc", null, [
      schema.node("paragraph", null, schema.text(text)),
    ]),
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
  on_matches_change: (update: FindMatchesUpdate) => void,
  selected_index = 0,
) {
  editor.dispatch(
    editor.state.tr.setMeta(find_highlight_plugin_key, {
      query,
      selected_index,
      on_matches_change,
    }),
  );
}

function type_at(editor: EditorView, pos: number, text: string) {
  editor.dispatch(editor.state.tr.insertText(text, pos));
}

function plugin_state(editor: EditorView) {
  const state = find_highlight_plugin_key.getState(editor.state);
  if (!state) throw new Error("find highlight plugin state missing");
  return state;
}

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = "";
});

describe("find match count push", () => {
  it("reports a higher count after new matching text is typed", () => {
    const on_matches_change = vi.fn();
    const editor = mount("foo bar");
    start_find(editor, "foo", on_matches_change);
    expect(plugin_state(editor).match_positions).toHaveLength(1);
    on_matches_change.mockClear();

    type_at(editor, editor.state.doc.content.size - 1, " foo");

    expect(on_matches_change).toHaveBeenCalledWith({
      match_count: 2,
      selected_index: 0,
    });
  });

  it("reports a lower count after matching text is deleted", () => {
    const on_matches_change = vi.fn();
    const editor = mount("foo foo");
    start_find(editor, "foo", on_matches_change);
    on_matches_change.mockClear();

    editor.dispatch(editor.state.tr.delete(4, 8));

    expect(on_matches_change).toHaveBeenCalledWith({
      match_count: 1,
      selected_index: 0,
    });
  });

  it("clamps the selected index into range when matches disappear", () => {
    const on_matches_change = vi.fn();
    const editor = mount("foo foo foo");
    start_find(editor, "foo", on_matches_change, 2);
    expect(plugin_state(editor).selected_index).toBe(2);
    on_matches_change.mockClear();

    editor.dispatch(editor.state.tr.delete(4, 12));

    expect(plugin_state(editor).selected_index).toBe(0);
    expect(on_matches_change).toHaveBeenCalledWith({
      match_count: 1,
      selected_index: 0,
    });
  });

  it("does not notify when a document change leaves the count untouched", () => {
    const on_matches_change = vi.fn();
    const editor = mount("foo bar");
    start_find(editor, "foo", on_matches_change);
    on_matches_change.mockClear();

    type_at(editor, editor.state.doc.content.size - 1, " baz");

    expect(on_matches_change).not.toHaveBeenCalled();
  });

  it("keeps notifying after a replace transaction carries no listener", () => {
    const on_matches_change = vi.fn();
    const editor = mount("foo foo");
    start_find(editor, "foo", on_matches_change);
    on_matches_change.mockClear();

    const match = plugin_state(editor).match_positions[0];
    if (!match) throw new Error("expected a match to replace");
    editor.dispatch(
      editor.state.tr
        .insertText("baz", match.from, match.to)
        .setMeta(find_highlight_plugin_key, {
          query: "foo",
          selected_index: 0,
        }),
    );
    on_matches_change.mockClear();

    type_at(editor, editor.state.doc.content.size - 1, " foo");

    expect(on_matches_change).toHaveBeenCalledWith({
      match_count: 2,
      selected_index: 0,
    });
  });

  it("stops notifying once the query is cleared", () => {
    const on_matches_change = vi.fn();
    const editor = mount("foo bar");
    start_find(editor, "foo", on_matches_change);
    editor.dispatch(
      editor.state.tr.setMeta(find_highlight_plugin_key, {
        query: "",
        selected_index: 0,
      }),
    );
    on_matches_change.mockClear();

    type_at(editor, editor.state.doc.content.size - 1, " foo");

    expect(on_matches_change).not.toHaveBeenCalled();
  });
});
