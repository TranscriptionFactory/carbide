/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  create_block_selection_plugin,
  block_selection_plugin_key,
  get_block_selection,
  type BlockSelectionMeta,
} from "$lib/features/editor/adapters/block_selection_plugin";
import {
  batch_turn_into,
  batch_duplicate,
  batch_delete,
} from "$lib/features/editor/adapters/block_transforms";

function make_doc(
  ...children: Parameters<typeof schema.nodes.doc.create>[1][]
) {
  return schema.nodes.doc.create(null, children as any);
}

function make_para(text?: string) {
  return schema.nodes.paragraph.create(
    null,
    text ? schema.text(text) : undefined,
  );
}

function make_heading(level: number, text?: string) {
  return schema.nodes.heading.create(
    { level, id: "" },
    text ? schema.text(text) : undefined,
  );
}

function make_state(doc: ReturnType<typeof make_doc>, cursor_pos = 1) {
  const state = EditorState.create({
    doc,
    schema,
    plugins: [create_block_selection_plugin()],
  });
  if (cursor_pos > 0) {
    return state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, cursor_pos)),
    );
  }
  return state;
}

function dispatch_meta(
  state: EditorState,
  meta: BlockSelectionMeta,
): EditorState {
  const tr = state.tr.setMeta(block_selection_plugin_key, meta);
  return state.apply(tr);
}

describe("block selection plugin", () => {
  describe("selection", () => {
    it("toggle adds a block to selection", () => {
      const doc = make_doc(make_para("one"), make_para("two"));
      const state = make_state(doc);
      const after = dispatch_meta(state, { action: "toggle", pos: 0 });
      const selection = get_block_selection(after);
      expect(selection.size).toBe(1);
      expect(selection.has(0)).toBe(true);
    });

    it("toggle again removes it", () => {
      const doc = make_doc(make_para("one"), make_para("two"));
      let state = make_state(doc);
      state = dispatch_meta(state, { action: "toggle", pos: 0 });
      state = dispatch_meta(state, { action: "toggle", pos: 0 });
      expect(get_block_selection(state).size).toBe(0);
    });

    it("extend adds range of blocks", () => {
      const doc = make_doc(
        make_para("one"),
        make_para("two"),
        make_para("three"),
      );
      let state = make_state(doc);
      // Set anchor at first block
      state = dispatch_meta(state, { action: "toggle", pos: 0 });
      // Extend to third block — should select all three
      const third_pos =
        state.doc.child(0).nodeSize + state.doc.child(1).nodeSize;
      state = dispatch_meta(state, { action: "extend", pos: third_pos });
      expect(get_block_selection(state).size).toBe(3);
    });

    it("escape clears selection", () => {
      const doc = make_doc(make_para("one"), make_para("two"));
      let state = make_state(doc);
      state = dispatch_meta(state, { action: "toggle", pos: 0 });
      expect(get_block_selection(state).size).toBe(1);
      state = dispatch_meta(state, { action: "clear" });
      expect(get_block_selection(state).size).toBe(0);
    });

    it("set replaces selection with provided positions", () => {
      const doc = make_doc(
        make_para("one"),
        make_para("two"),
        make_para("three"),
      );
      let state = make_state(doc);
      const second_pos = state.doc.child(0).nodeSize;
      state = dispatch_meta(state, {
        action: "set",
        positions: [0, second_pos],
      });
      expect(get_block_selection(state).size).toBe(2);
    });

    it("doc change remaps positions correctly", () => {
      const doc = make_doc(
        make_para("one"),
        make_para("two"),
        make_para("three"),
      );
      let state = make_state(doc);
      const second_pos = state.doc.child(0).nodeSize;
      state = dispatch_meta(state, { action: "toggle", pos: second_pos });
      expect(get_block_selection(state).size).toBe(1);
      // Insert text at beginning of doc — positions should remap
      const tr = state.tr.insertText("prefix ", 1);
      state = state.apply(tr);
      const selection = get_block_selection(state);
      expect(selection.size).toBe(1);
      // The position should have been remapped
      expect(selection.has(second_pos)).toBe(false);
    });

    it("deleting a selected block removes its position from selection", () => {
      const doc = make_doc(make_para("one"), make_para("two"));
      let state = make_state(doc);
      state = dispatch_meta(state, { action: "toggle", pos: 0 });
      expect(get_block_selection(state).size).toBe(1);
      // Delete the first block
      const first_end = state.doc.child(0).nodeSize;
      const tr = state.tr.delete(0, first_end);
      state = state.apply(tr);
      // Selection should remap — position 0 now points to what was the second block
      const selection = get_block_selection(state);
      expect(selection.size).toBe(1);
    });
  });

  describe("batch operations", () => {
    it("batch turn_into converts all selected blocks", () => {
      const doc = make_doc(
        make_para("one"),
        make_para("two"),
        make_para("three"),
      );
      const state = make_state(doc);
      const second_pos = state.doc.child(0).nodeSize;
      const positions = new Set([0, second_pos]);
      let new_state = state;
      batch_turn_into("heading", { level: 2 }, positions, state, (tr) => {
        new_state = state.apply(tr);
      });
      expect(new_state.doc.child(0).type.name).toBe("heading");
      expect(new_state.doc.child(0).attrs["level"]).toBe(2);
      expect(new_state.doc.child(1).type.name).toBe("heading");
      expect(new_state.doc.child(1).attrs["level"]).toBe(2);
      // Third block should remain paragraph
      expect(new_state.doc.child(2).type.name).toBe("paragraph");
    });

    it("batch delete removes all selected blocks in single undo step", () => {
      const doc = make_doc(
        make_para("one"),
        make_para("two"),
        make_para("three"),
        make_para("four"),
      );
      const state = make_state(doc);
      const second_pos = state.doc.child(0).nodeSize;
      const third_pos = second_pos + state.doc.child(1).nodeSize;
      const positions = new Set([0, third_pos]);
      let new_state = state;
      batch_delete(positions, state, (tr) => {
        new_state = state.apply(tr);
      });
      expect(new_state.doc.childCount).toBe(2);
      expect(new_state.doc.child(0).textContent).toBe("two");
      expect(new_state.doc.child(1).textContent).toBe("four");
    });

    it("batch duplicate duplicates all selected blocks", () => {
      const doc = make_doc(make_para("one"), make_para("two"));
      const state = make_state(doc);
      const second_pos = state.doc.child(0).nodeSize;
      const positions = new Set([0, second_pos]);
      let new_state = state;
      batch_duplicate(positions, state, (tr) => {
        new_state = state.apply(tr);
      });
      expect(new_state.doc.childCount).toBe(4);
    });

    it("batch delete on last block replaces with empty paragraph", () => {
      const doc = make_doc(make_para("only"));
      const state = make_state(doc);
      const positions = new Set([0]);
      let new_state = state;
      batch_delete(positions, state, (tr) => {
        new_state = state.apply(tr);
      });
      expect(new_state.doc.childCount).toBe(1);
      expect(new_state.doc.child(0).type.name).toBe("paragraph");
      expect(new_state.doc.child(0).textContent).toBe("");
    });

    it("batch turn_into with empty positions returns false", () => {
      const doc = make_doc(make_para("one"));
      const state = make_state(doc);
      const result = batch_turn_into("heading", { level: 1 }, new Set(), state);
      expect(result).toBe(false);
    });
  });
});
