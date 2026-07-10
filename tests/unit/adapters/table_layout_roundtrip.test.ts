import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  parse_table_meta,
  format_table_meta_comment,
} from "$lib/features/editor/adapters/remark_plugins/remark_table_meta";

const TABLE_MD = "| a | b |\n| --- | --- |\n| 1 | 2 |";
const META_COMMENT = "<!-- carbide:table layout=fixed -->";

function make_pm_table(layout: "auto" | "fixed") {
  const cell = (text: string) =>
    schema.nodes.table_cell.create(null, [
      schema.nodes.paragraph.create(null, schema.text(text)),
    ]);
  const header = (text: string) =>
    schema.nodes.table_header.create(null, [
      schema.nodes.paragraph.create(null, schema.text(text)),
    ]);
  const table = schema.nodes.table.create({ layout }, [
    schema.nodes.table_row.create(null, [header("a"), header("b")]),
    schema.nodes.table_row.create(null, [cell("1"), cell("2")]),
  ]);
  return schema.nodes.doc.create(null, [table]);
}

function find_table(doc: ReturnType<typeof parse_markdown>) {
  let found: { attrs: Record<string, unknown> } | null = null;
  doc.descendants((node) => {
    if (node.type === schema.nodes.table) {
      found = node as unknown as { attrs: Record<string, unknown> };
      return false;
    }
    return true;
  });
  return found;
}

describe("table meta helpers", () => {
  it("parses a fixed layout comment", () => {
    expect(parse_table_meta(META_COMMENT)).toEqual({ layout: "fixed" });
  });

  it("ignores unknown keys and values", () => {
    expect(parse_table_meta("<!-- carbide:table layout=banana -->")).toEqual(
      {},
    );
    expect(parse_table_meta("<!-- carbide:table foo=bar -->")).toEqual({});
  });

  it("returns null for non-carbide comments", () => {
    expect(parse_table_meta("<!-- just a comment -->")).toBeNull();
    expect(parse_table_meta("not html")).toBeNull();
  });

  it("formats a layout comment", () => {
    expect(format_table_meta_comment("fixed")).toBe(META_COMMENT);
  });
});

describe("table layout markdown roundtrip", () => {
  it("comment before table parses as fixed layout with no stray text", () => {
    const doc = parse_markdown(`${META_COMMENT}\n\n${TABLE_MD}`);
    const table = find_table(doc);
    expect(table?.attrs["layout"]).toBe("fixed");
    expect(doc.textContent).not.toContain("carbide:table");
  });

  it("table without comment defaults to auto", () => {
    const doc = parse_markdown(TABLE_MD);
    expect(find_table(doc)?.attrs["layout"]).toBe("auto");
  });

  it("fixed table serializes with the meta comment", () => {
    const output = serialize_markdown(make_pm_table("fixed"));
    expect(output).toContain(META_COMMENT);
  });

  it("auto table serializes without any meta comment", () => {
    const output = serialize_markdown(make_pm_table("auto"));
    expect(output).not.toContain("carbide:table");
  });

  it("fixed layout survives a full serialize→parse cycle", () => {
    const output = serialize_markdown(make_pm_table("fixed"));
    const reparsed = parse_markdown(output);
    expect(find_table(reparsed)?.attrs["layout"]).toBe("fixed");
  });

  it("tolerates unknown layout values", () => {
    const doc = parse_markdown(
      `<!-- carbide:table layout=banana -->\n\n${TABLE_MD}`,
    );
    expect(find_table(doc)?.attrs["layout"]).toBe("auto");
    expect(doc.textContent).not.toContain("carbide:table");
  });

  it("drops orphan comments not followed by a table", () => {
    const doc = parse_markdown(`${META_COMMENT}\n\nJust a paragraph.`);
    expect(doc.textContent).not.toContain("carbide:table");
    expect(doc.textContent).toContain("Just a paragraph.");
  });

  it("fixed table nested in a callout body round-trips", () => {
    const input = `> [!note]\n> ${META_COMMENT}\n>\n> | a | b |\n> | --- | --- |\n> | 1 | 2 |`;
    const doc = parse_markdown(input);
    const table = find_table(doc);
    expect(table?.attrs["layout"]).toBe("fixed");

    const output = serialize_markdown(doc);
    expect(output).toContain("carbide:table layout=fixed");
    const reparsed = parse_markdown(output);
    expect(find_table(reparsed)?.attrs["layout"]).toBe("fixed");
  });
});
