import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import { columnResizing, tableEditing } from "prosemirror-tables";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  append_column,
  append_row,
} from "$lib/features/editor/adapters/table_command_utils";

describe("table serialization", () => {
  it("programmatically created table has valid schema structure", () => {
    const { nodes: n } = schema;
    const header_row = n.table_row.create(null, [
      n.table_header.create(null, n.paragraph.create(null, schema.text("A"))),
      n.table_header.create(null, n.paragraph.create(null, schema.text("B"))),
    ]);
    const body_row = n.table_row.create(null, [
      n.table_cell.create(null, n.paragraph.create()),
      n.table_cell.create(null, n.paragraph.create()),
    ]);
    const table = n.table.create(null, [header_row, body_row]);

    expect(table.type.name).toBe("table");
    expect(table.childCount).toBe(2);
    expect(table.child(0).type.name).toBe("table_row");
    expect(table.child(0).child(0).type.name).toBe("table_header");
    expect(table.child(1).child(0).type.name).toBe("table_cell");

    // Verify the table validates against the schema
    expect(table.check()).toBeUndefined();
  });

  it("round-trips simple table without trailing backslashes", () => {
    const input = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).not.toContain("\\\\");
    expect(output).toBe(input);
  });

  it("round-trips emoji shortcode table without corruption", () => {
    const input = [
      "| :smile: `:smile:` | :laugh: `:laugh:` |",
      "| --- | --- |",
      "| :wink: `:wink:` | :grin: `:grin:` |",
    ].join("\n");
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).not.toContain("\\\\");
    for (const line of output.split("\n")) {
      expect(line).not.toMatch(/\\+$/);
    }
  });

  it("round-trips table with bold/italic content", () => {
    const input = "| **bold** | *italic* |\n| --- | --- |\n| cell | cell |";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).not.toContain("\\\\");
    expect(output).toBe(input);
  });

  it("preserves table alignment markers", () => {
    const input =
      "| Left | Center | Right |\n| --- | :---: | ---: |\n| a | b | c |";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).toContain(":---:");
    expect(output).toContain("---:");
  });

  it("round-trips exact emoji file table content", () => {
    const input = [
      "| :bowtie:  `:bowtie:` | :smile:  `:smile:` | :laughing:  `:laughing:` |",
      "|---|---|---|",
      "| :blush:  `:blush:` | :smiley:  `:smiley:` | :relaxed:  `:relaxed:` |",
    ].join("\n");
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    // No trailing backslashes on any line
    for (const line of output.split("\n")) {
      expect(line).not.toMatch(/\\+\s*$/);
    }
    // No double-backslash anywhere
    expect(output).not.toContain("\\\\");
    // Doc node structure is a table
    expect(doc.child(0).type.name).toBe("table");
  });

  it("round-trips large emoji table without corruption", () => {
    const lines = [
      "| :bowtie:  `:bowtie:` | :smile:  `:smile:` | :laughing:  `:laughing:` |",
      "|---|---|---|",
    ];
    for (let i = 0; i < 20; i++) {
      lines.push(
        "| :blush:  `:blush:` | :smiley:  `:smiley:` | :relaxed:  `:relaxed:` |",
      );
    }
    const input = lines.join("\n");
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    for (const line of output.split("\n")) {
      expect(line).not.toMatch(/\\+\s*$/);
    }
  });

  it("converts emoji shortcodes to unicode on initial parse", () => {
    const input = "Hello :smile: world";
    const doc = parse_markdown(input);
    const text = doc.textContent;
    expect(text).not.toContain(":smile:");
    expect(text).toContain("\u{1F604}");
  });

  it("converts emoji shortcodes in table cells on parse", () => {
    const input = "| :smile: | :heart: |\n| --- | --- |\n| :+1: | :star: |";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).not.toContain(":smile:");
    expect(output).not.toContain(":heart:");
  });

  it("round-trips byte-stable with table-editing plugins registered", () => {
    const input = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const doc = parse_markdown(input);
    const state = EditorState.create({
      doc,
      schema,
      plugins: [columnResizing(), tableEditing()],
    });
    const output = serialize_markdown(state.doc).trim();
    expect(output).toBe(input);
  });

  it("serializes an edge-appended column/row without leaking width", () => {
    const input = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const state = EditorState.create({
      doc: parse_markdown(input),
      schema,
      plugins: [columnResizing(), tableEditing()],
    });
    const table = { pos: 0, start: 1, node: state.doc.child(0) };

    const with_col = state.apply(append_column(state, table));
    const col_table = { pos: 0, start: 1, node: with_col.doc.child(0) };
    const with_row = with_col.apply(append_row(with_col, col_table));

    const output = serialize_markdown(with_row.doc).trim();
    const lines = output.split("\n");

    // 3 columns (separator row is the reliable count — appended cells are empty)
    // and 4 lines: header, separator, original body row, appended body row.
    expect((lines[1] ?? "").split("|").filter((c) => c.trim()).length).toBe(3);
    expect(lines.length).toBe(4);
    expect(output).not.toContain("width");
    expect(output).not.toContain("\\\\");
  });
});
