import { describe, it, expect } from "vitest";
import {
  parse_base_view_spec,
  serialize_base_view_spec,
  type BaseViewSpec,
} from "$lib/features/smart_blocks/domain/base_view_spec";

describe("parse_base_view_spec", () => {
  it("parses view, group_by and a colon-bearing query", () => {
    const result = parse_base_view_spec(
      "view: kanban\ngroup_by: status\nquery: notes with:#project-x",
    );
    expect(result).toEqual({
      ok: true,
      spec: {
        view: "kanban",
        query: "notes with:#project-x",
        group_by: ["status"],
        date_property: null,
      },
    });
  });

  it("defaults the view to table when omitted", () => {
    const result = parse_base_view_spec("query: notes in:work/");
    expect(result.ok && result.spec.view).toBe("table");
  });

  it("splits comma-separated group_by for tree views", () => {
    const result = parse_base_view_spec(
      "view: tree\ngroup_by: year, month\nquery: notes",
    );
    expect(result.ok && result.spec.group_by).toEqual(["year", "month"]);
  });

  it("parses date_property for calendar views", () => {
    const result = parse_base_view_spec(
      "view: calendar\ndate_property: due\nquery: notes",
    );
    expect(result.ok && result.spec.date_property).toBe("due");
  });

  it("ignores blank and malformed lines", () => {
    const result = parse_base_view_spec(
      "\nview: list\n   \ngarbage line\nquery: notes",
    );
    expect(result.ok && result.spec.view).toBe("list");
  });

  it("errors when the query is missing", () => {
    expect(parse_base_view_spec("view: table")).toEqual({
      ok: false,
      error: "base block requires a query",
    });
  });

  it("errors when the query is blank", () => {
    expect(parse_base_view_spec("view: table\nquery:   ").ok).toBe(false);
  });

  it("errors on an unknown view", () => {
    expect(parse_base_view_spec("view: spreadsheet\nquery: notes")).toEqual({
      ok: false,
      error: "Unknown view: spreadsheet",
    });
  });
});

describe("serialize_base_view_spec", () => {
  function spec(overrides: Partial<BaseViewSpec> = {}): BaseViewSpec {
    return {
      view: "table",
      query: "notes with:#project-x",
      group_by: [],
      date_property: null,
      ...overrides,
    };
  }

  it("round-trips a kanban spec", () => {
    const original = spec({ view: "kanban", group_by: ["status"] });
    const text = serialize_base_view_spec(original);
    expect(text).toBe(
      "view: kanban\ngroup_by: status\nquery: notes with:#project-x",
    );
    expect(parse_base_view_spec(text)).toEqual({ ok: true, spec: original });
  });

  it("omits group_by for views that do not use it", () => {
    const text = serialize_base_view_spec(
      spec({ view: "table", group_by: ["status"] }),
    );
    expect(text).toBe("view: table\nquery: notes with:#project-x");
  });

  it("serializes calendar date_property", () => {
    const text = serialize_base_view_spec(
      spec({ view: "calendar", date_property: "due" }),
    );
    expect(text).toBe(
      "view: calendar\ndate_property: due\nquery: notes with:#project-x",
    );
  });
});
