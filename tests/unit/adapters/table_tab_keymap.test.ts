/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { chainCommands } from "prosemirror-commands";
import { sinkListItem } from "prosemirror-schema-list";
import { schema } from "$lib/features/editor/adapters/schema";
import { selection_in_table } from "$lib/features/editor/extensions/core_extension";
import { create_table_extension } from "$lib/features/editor/extensions/table_extension";

function make_cell(text: string) {
  return schema.nodes.table_cell.create(null, [
    schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined),
  ]);
}

function make_doc_with_table() {
  const row = schema.nodes.table_row.create(null, [
    make_cell("one"),
    make_cell("two"),
  ]);
  const table = schema.nodes.table.create(null, [row]);
  const paragraph = schema.nodes.paragraph.create(null, schema.text("outside"));
  return schema.nodes.doc.create(null, [table, paragraph]);
}

const list_item_type = schema.nodes["list_item"];
const tab_command = chainCommands(
  sinkListItem(list_item_type),
  (state) => !selection_in_table(state),
);

// doc(0) > table(1) > row(2) > cell(3) > paragraph(4) > text at 4
const FIRST_CELL_TEXT_POS = 4;

function state_with_selection(pos: number) {
  const doc = make_doc_with_table();
  const state = EditorState.create({ doc, schema });
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, pos)),
  );
}

function paragraph_pos(doc: ReturnType<typeof make_doc_with_table>) {
  return doc.content.size - 3;
}

describe("selection_in_table", () => {
  it("returns true when selection is inside a table cell", () => {
    const state = state_with_selection(FIRST_CELL_TEXT_POS);
    expect(selection_in_table(state)).toBe(true);
  });

  it("returns false when selection is in a top-level paragraph", () => {
    const doc = make_doc_with_table();
    const state = state_with_selection(paragraph_pos(doc));
    expect(selection_in_table(state)).toBe(false);
  });
});

describe("core Tab fallback", () => {
  it("returns false inside a table cell so the table keymap can handle Tab", () => {
    const state = state_with_selection(FIRST_CELL_TEXT_POS);
    expect(tab_command(state)).toBe(false);
  });

  it("returns true outside tables so Tab stays consumed by the editor", () => {
    const doc = make_doc_with_table();
    const state = state_with_selection(paragraph_pos(doc));
    expect(tab_command(state)).toBe(true);
  });
});

describe("Tab in table moves to next cell", () => {
  it("dispatching Tab moves selection from first cell to second cell", () => {
    const doc = make_doc_with_table();
    const el = document.createElement("div");
    const state = EditorState.create({
      doc,
      schema,
      plugins: create_table_extension().plugins,
    });
    const view = new EditorView(el, { state });
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, FIRST_CELL_TEXT_POS),
      ),
    );

    expect(tab_command(view.state)).toBe(false);

    const event = new KeyboardEvent("keydown", { key: "Tab" });
    let handled = false;
    view.someProp("handleKeyDown", (handler) => {
      handled = handled || handler(view, event) === true;
      return handled;
    });
    expect(handled).toBe(true);

    const $from = view.state.selection.$from;
    let cell_text = "";
    for (let d = $from.depth; d >= 1; d--) {
      if ($from.node(d).type === schema.nodes.table_cell) {
        cell_text = $from.node(d).textContent;
        break;
      }
    }
    expect(cell_text).toBe("two");
    view.destroy();
  });
});
