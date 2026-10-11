/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import { add_labelled_column } from "$lib/features/editor/adapters/table_toolbar_plugin";

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = "";
});

function paragraph(text: string) {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
}

function mount_table(headers: string[], selected_header: string): EditorView {
  const header_row = schema.nodes.table_row.create(
    null,
    headers.map((h) => schema.nodes.table_header.create(null, paragraph(h))),
  );
  const body_row = schema.nodes.table_row.create(
    null,
    headers.map(() => schema.nodes.table_cell.create(null, paragraph(""))),
  );
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.table.create(null, [header_row, body_row]),
  ]);

  let caret = -1;
  doc.descendants((node, pos) => {
    if (
      node.type.name === "table_header" &&
      node.textContent === selected_header
    ) {
      caret = pos + 2;
    }
  });
  if (caret < 0) throw new Error(`header "${selected_header}" not found`);

  const target = document.createElement("div");
  document.body.appendChild(target);
  view = new EditorView(target, {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, caret),
    }),
  });
  return view;
}

function header_texts(v: EditorView): string[] {
  const texts: string[] = [];
  v.state.doc.descendants((node) => {
    if (node.type.name === "table_header") texts.push(node.textContent);
  });
  return texts;
}

function body_texts(v: EditorView): string[] {
  const texts: string[] = [];
  v.state.doc.descendants((node) => {
    if (node.type.name === "table_cell") texts.push(node.textContent);
  });
  return texts;
}

describe("add_labelled_column", () => {
  it("labels an appended column with the next number", () => {
    const v = mount_table(["Col 1", "Col 2"], "Col 2");
    expect(add_labelled_column(v, "after")).toBe(true);
    expect(header_texts(v)).toEqual(["Col 1", "Col 2", "Col 3"]);
  });

  it("fills the smallest unused number", () => {
    const v = mount_table(["Col 1", "Col 3"], "Col 3");
    add_labelled_column(v, "after");
    expect(header_texts(v)).toEqual(["Col 1", "Col 3", "Col 2"]);
  });

  it("starts from Col 1 when only higher numbers are taken", () => {
    const v = mount_table(["Col 2", "Col 5"], "Col 5");
    add_labelled_column(v, "after");
    expect(header_texts(v)).toEqual(["Col 2", "Col 5", "Col 1"]);
  });

  it("labels a column inserted before without renumbering others", () => {
    const v = mount_table(["Col 1", "Col 2"], "Col 1");
    add_labelled_column(v, "before");
    expect(header_texts(v)).toEqual(["Col 3", "Col 1", "Col 2"]);
  });

  it("labels a column inserted in the middle", () => {
    const v = mount_table(["Col 1", "Col 2"], "Col 1");
    add_labelled_column(v, "after");
    expect(header_texts(v)).toEqual(["Col 1", "Col 3", "Col 2"]);
  });

  it("never renames user-written headers", () => {
    const v = mount_table(["Name", "Age"], "Name");
    add_labelled_column(v, "after");
    expect(header_texts(v)).toEqual(["Name", "Col 1", "Age"]);
  });

  it("leaves the new column's body cells empty", () => {
    const v = mount_table(["Col 1", "Col 2"], "Col 2");
    add_labelled_column(v, "after");
    expect(body_texts(v)).toEqual(["", "", ""]);
  });
});
