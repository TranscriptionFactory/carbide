import { describe, it, expect } from "vitest";
import { Schema } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import {
  create_ai_menu_plugin,
  ai_menu_plugin_key,
  get_ai_menu_state,
  type AiMenuMeta,
} from "$lib/features/editor/adapters/ai_menu_plugin";

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
      text: { group: "inline" },
    },
    marks: {},
  });
}

function create_state(text = "Hello world") {
  const schema = create_test_schema();
  const plugin = create_ai_menu_plugin();
  return EditorState.create({
    doc: schema.node("doc", null, [
      schema.node("paragraph", null, text ? [schema.text(text)] : []),
    ]),
    plugins: [plugin],
  });
}

function apply_meta(state: EditorState, meta: AiMenuMeta): EditorState {
  return state.apply(state.tr.setMeta(ai_menu_plugin_key, meta));
}

describe("ai_menu_plugin", () => {
  it("initializes with closed state", () => {
    const state = create_state();
    const ps = get_ai_menu_state(state);
    expect(ps.open).toBe(false);
    expect(ps.streaming).toBe(false);
  });

  it("opens menu on 'open' meta without selection", () => {
    const state = create_state();
    const next = apply_meta(state, { action: "open" });
    const ps = get_ai_menu_state(next);
    expect(ps.open).toBe(true);
    expect(ps.mode).toBe("cursor_command");
  });

  it("opens in selection_command mode when text is selected", () => {
    const schema = create_test_schema();
    const plugin = create_ai_menu_plugin();
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("Hello world")]),
    ]);
    let state = EditorState.create({ doc, plugins: [plugin] });

    const { tr } = state;
    tr.setSelection(TextSelection.create(tr.doc, 1, 6));
    state = state.apply(tr);

    const next = apply_meta(state, { action: "open" });
    const ps = get_ai_menu_state(next);
    expect(ps.open).toBe(true);
    expect(ps.mode).toBe("selection_command");
  });

  it("closes menu on 'close' meta", () => {
    const state = create_state();
    let next = apply_meta(state, { action: "open" });
    next = apply_meta(next, { action: "close" });
    const ps = get_ai_menu_state(next);
    expect(ps.open).toBe(false);
  });

  it("tracks streaming state", () => {
    const state = create_state();
    let next = apply_meta(state, { action: "open" });
    next = apply_meta(next, { action: "start_stream", anchor_pos: 5 });
    let ps = get_ai_menu_state(next);
    expect(ps.streaming).toBe(true);
    expect(ps.ai_range_from).toBe(5);
    expect(ps.ai_range_to).toBe(5);

    next = apply_meta(next, { action: "stream_text", text: "Hello" });
    ps = get_ai_menu_state(next);
    expect(ps.ai_range_to).toBe(10);

    next = apply_meta(next, { action: "stream_done" });
    ps = get_ai_menu_state(next);
    expect(ps.streaming).toBe(false);
    expect(ps.mode).toBe("cursor_suggestion");
  });

  it("resets state on accept", () => {
    const state = create_state();
    let next = apply_meta(state, { action: "open" });
    next = apply_meta(next, { action: "start_stream", anchor_pos: 5 });
    next = apply_meta(next, { action: "stream_done" });
    next = apply_meta(next, { action: "accept" });
    const ps = get_ai_menu_state(next);
    expect(ps.open).toBe(false);
  });

  it("resets state on reject", () => {
    const state = create_state();
    let next = apply_meta(state, { action: "open" });
    next = apply_meta(next, { action: "start_stream", anchor_pos: 5 });
    next = apply_meta(next, { action: "stream_done" });
    next = apply_meta(next, { action: "reject" });
    const ps = get_ai_menu_state(next);
    expect(ps.open).toBe(false);
  });
});
