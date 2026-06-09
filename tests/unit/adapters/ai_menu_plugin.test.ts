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

function open_with_selection(
  state: EditorState,
  from: number,
  to: number,
): EditorState {
  const selected = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, from, to)),
  );
  return apply_meta(selected, { action: "open" });
}

function start_stream(state: EditorState): EditorState {
  const { from, to } = state.selection;
  const tr = state.tr;
  if (from !== to) tr.delete(from, to);
  tr.setMeta(ai_menu_plugin_key, { action: "start_stream", anchor_pos: from });
  return state.apply(tr);
}

function stream_text(state: EditorState, text: string): EditorState {
  const ps = get_ai_menu_state(state);
  const tr = state.tr.insertText(text, ps.ai_range_to);
  tr.setMeta(ai_menu_plugin_key, { action: "stream_text", text });
  return state.apply(tr);
}

function retry_stream(state: EditorState): EditorState {
  const ps = get_ai_menu_state(state);
  const tr = state.tr.delete(ps.ai_range_from, ps.ai_range_to);
  tr.setMeta(ai_menu_plugin_key, { action: "retry" });
  return state.apply(tr);
}

function reject_stream(state: EditorState): EditorState {
  const ps = get_ai_menu_state(state);
  const original_doc = ps.original_doc;
  if (!original_doc) throw new Error("expected original_doc on reject");
  const tr = state.tr.replaceWith(
    0,
    state.doc.content.size,
    original_doc.content,
  );
  tr.setMeta(ai_menu_plugin_key, { action: "reject" });
  return state.apply(tr);
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

  it("captures the pristine doc on open, not on start_stream", () => {
    const state = create_state("Hello world");
    const opened = apply_meta(state, { action: "open" });
    const ps = get_ai_menu_state(opened);
    expect(ps.original_doc?.textContent).toBe("Hello world");
  });
});

describe("ai_menu_plugin — selection replace & retry flow", () => {
  // "Hello world": text occupies positions 1..12; "world" is 7..12.
  it("cursor-only insert anchors the AI range at the cursor", () => {
    const state = create_state("Hello world");
    const cursor = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 12, 12)),
    );
    let next = apply_meta(cursor, { action: "open" });
    next = start_stream(next);
    let ps = get_ai_menu_state(next);
    expect(ps.ai_range_from).toBe(12);
    expect(ps.ai_range_to).toBe(12);

    next = stream_text(next, "!");
    ps = get_ai_menu_state(next);
    expect(next.doc.textContent).toBe("Hello world!");
    expect(ps.ai_range_to).toBe(13);
  });

  it("selection-replace deletes the selection before streaming", () => {
    const state = create_state("Hello world");
    let next = open_with_selection(state, 7, 12);
    expect(get_ai_menu_state(next).mode).toBe("selection_command");

    next = start_stream(next);
    expect(next.doc.textContent).toBe("Hello ");
    const ps = get_ai_menu_state(next);
    expect(ps.ai_range_from).toBe(7);
    expect(ps.ai_range_to).toBe(7);

    next = stream_text(next, "everyone");
    expect(next.doc.textContent).toBe("Hello everyone");
  });

  it("retry replaces the previous generation instead of appending", () => {
    const state = create_state("Hello world");
    let next = open_with_selection(state, 7, 12);
    next = start_stream(next);
    next = stream_text(next, "first");
    next = apply_meta(next, { action: "stream_done" });
    expect(next.doc.textContent).toBe("Hello first");

    next = retry_stream(next);
    const ps = get_ai_menu_state(next);
    expect(ps.streaming).toBe(true);
    expect(ps.ai_range_to).toBe(ps.ai_range_from);
    expect(next.doc.textContent).toBe("Hello ");

    next = stream_text(next, "second");
    expect(next.doc.textContent).toBe("Hello second");
  });

  it("reject after retry restores the pristine original doc", () => {
    const state = create_state("Hello world");
    let next = open_with_selection(state, 7, 12);
    next = start_stream(next);
    next = stream_text(next, "first");
    next = apply_meta(next, { action: "stream_done" });

    next = retry_stream(next);
    next = stream_text(next, "second");
    next = apply_meta(next, { action: "stream_done" });
    expect(next.doc.textContent).toBe("Hello second");

    next = reject_stream(next);
    expect(next.doc.textContent).toBe("Hello world");
    expect(get_ai_menu_state(next).open).toBe(false);
  });

  it("reject after a cursor-only generation restores the original doc", () => {
    const state = create_state("Hello world");
    const cursor = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 12, 12)),
    );
    let next = apply_meta(cursor, { action: "open" });
    next = start_stream(next);
    next = stream_text(next, " again");
    next = apply_meta(next, { action: "stream_done" });
    expect(next.doc.textContent).toBe("Hello world again");

    next = reject_stream(next);
    expect(next.doc.textContent).toBe("Hello world");
  });
});
