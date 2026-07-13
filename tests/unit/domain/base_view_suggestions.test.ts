import { describe, it, expect } from "vitest";
import { suggest_base_spec } from "$lib/features/smart_blocks/domain/base_view_suggestions";
import type { DslContext } from "$lib/shared/types/dsl_suggestion";

const ctx: DslContext = {
  tags: ["project", "personal"],
  note_names: ["Alpha", "Beta"],
  folder_paths: ["work/reports"],
  property_names: ["status", "due", "priority"],
};

function labels(text: string): string[] {
  return suggest_base_spec(text, ctx).items.map((i) => i.label);
}

describe("suggest_base_spec keys", () => {
  it("suggests field keys on an empty line", () => {
    expect(labels("")).toEqual(["view", "query", "group_by", "date_property"]);
  });

  it("filters keys by prefix, case-insensitively", () => {
    expect(labels("gr")).toEqual(["group_by"]);
    expect(labels("DA")).toEqual(["date_property"]);
  });

  it("points from at the start of the key partial", () => {
    expect(suggest_base_spec("  vi", ctx).from).toBe(2);
    const first = suggest_base_spec("vi", ctx).items[0];
    expect(first?.insert).toBe("view: ");
  });
});

describe("suggest_base_spec view values", () => {
  it("suggests view modes after view:", () => {
    expect(labels("view: ")).toEqual([
      "table",
      "list",
      "kanban",
      "gallery",
      "calendar",
      "tree",
    ]);
  });

  it("filters view modes by prefix", () => {
    expect(labels("view: ta")).toEqual(["table"]);
    expect(suggest_base_spec("view: ta", ctx).from).toBe("view: ".length);
  });
});

describe("suggest_base_spec property values", () => {
  it("suggests properties after group_by:", () => {
    expect(labels("group_by: ")).toEqual(["status", "due", "priority"]);
  });

  it("suggests properties after date_property: with prefix filter", () => {
    expect(labels("date_property: pr")).toEqual(["priority"]);
  });
});

describe("suggest_base_spec query delegation", () => {
  it("delegates to suggest_query after query:", () => {
    expect(labels("query: ")).toContain("notes");
  });

  it("shifts the query delegation offset into full-text coordinates", () => {
    const res = suggest_base_spec("query: notes with #pro", ctx);
    expect(res.items.map((i) => i.label)).toContain("project");
    expect(res.from).toBe("query: notes with ".length);
  });
});

describe("suggest_base_spec multi-line", () => {
  it("operates on the current line only", () => {
    const text = "view: table\nquery: ";
    expect(suggest_base_spec(text, ctx).items.map((i) => i.label)).toContain(
      "notes",
    );
    expect(suggest_base_spec(text, ctx).from).toBe(text.length);
  });

  it("suggests keys on a fresh trailing line", () => {
    expect(labels("view: table\n")).toEqual([
      "view",
      "query",
      "group_by",
      "date_property",
    ]);
  });
});
