import { describe, expect, it } from "vitest";
import { parse_task_query } from "$lib/features/task/parse_task_query";

describe("parse_task_query", () => {
  it("parses 'not done'", () => {
    const { query, errors } = parse_task_query("not done");
    expect(errors).toEqual([]);
    expect(query.filters).toEqual([
      { property: "status", operator: "neq", value: "done" },
    ]);
  });

  it("parses 'done'", () => {
    const { query, errors } = parse_task_query("done");
    expect(errors).toEqual([]);
    expect(query.filters).toEqual([
      { property: "status", operator: "eq", value: "done" },
    ]);
  });

  it("parses 'status is todo'", () => {
    const { query, errors } = parse_task_query("status is todo");
    expect(errors).toEqual([]);
    expect(query.filters).toEqual([
      { property: "status", operator: "eq", value: "todo" },
    ]);
  });

  it("parses 'status is doing'", () => {
    const { query, errors } = parse_task_query("status is doing");
    expect(errors).toEqual([]);
    expect(query.filters).toEqual([
      { property: "status", operator: "eq", value: "doing" },
    ]);
  });

  it("parses 'path includes daily/'", () => {
    const { query, errors } = parse_task_query("path includes daily/");
    expect(errors).toEqual([]);
    expect(query.filters).toEqual([
      { property: "path", operator: "contains", value: "daily/" },
    ]);
  });

  it("parses 'section includes Shopping'", () => {
    const { query, errors } = parse_task_query("section includes Shopping");
    expect(errors).toEqual([]);
    expect(query.filters).toEqual([
      { property: "section", operator: "contains", value: "Shopping" },
    ]);
  });

  it("parses 'text includes urgent'", () => {
    const { query, errors } = parse_task_query("text includes urgent");
    expect(errors).toEqual([]);
    expect(query.filters).toEqual([
      { property: "text", operator: "contains", value: "urgent" },
    ]);
  });

  it("parses 'due before <date>'", () => {
    const { query, errors } = parse_task_query("due before 2026-05-01");
    expect(errors).toEqual([]);
    expect(query.filters).toEqual([
      { property: "due_date", operator: "lt", value: "2026-05-01" },
    ]);
  });

  it("parses 'due after <date>'", () => {
    const { query, errors } = parse_task_query("due after 2026-01-01");
    expect(errors).toEqual([]);
    expect(query.filters).toEqual([
      { property: "due_date", operator: "gt", value: "2026-01-01" },
    ]);
  });

  it("parses 'due on <date>'", () => {
    const { query, errors } = parse_task_query("due on 2026-04-24");
    expect(errors).toEqual([]);
    expect(query.filters).toEqual([
      { property: "due_date", operator: "eq", value: "2026-04-24" },
    ]);
  });

  it("parses 'due today'", () => {
    const { query, errors } = parse_task_query("due today");
    expect(errors).toEqual([]);
    expect(query.filters).toHaveLength(1);
    expect(query.filters[0]!.property).toBe("due_date");
    expect(query.filters[0]!.operator).toBe("eq");
    expect(query.filters[0]!.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("parses 'has due date'", () => {
    const { query, errors } = parse_task_query("has due date");
    expect(errors).toEqual([]);
    expect(query.filters).toEqual([
      { property: "due_date", operator: "neq", value: "" },
    ]);
  });

  it("parses 'no due date'", () => {
    const { query, errors } = parse_task_query("no due date");
    expect(errors).toEqual([]);
    expect(query.filters).toEqual([
      { property: "due_date", operator: "eq", value: "" },
    ]);
  });

  it("parses 'sort by due'", () => {
    const { query, errors } = parse_task_query("sort by due_date");
    expect(errors).toEqual([]);
    expect(query.sort).toEqual([{ property: "due_date", descending: false }]);
  });

  it("parses 'sort by status desc'", () => {
    const { query, errors } = parse_task_query("sort by status desc");
    expect(errors).toEqual([]);
    expect(query.sort).toEqual([{ property: "status", descending: true }]);
  });

  it("parses 'group by status'", () => {
    const { grouping, errors } = parse_task_query("group by status");
    expect(errors).toEqual([]);
    expect(grouping).toBe("status");
  });

  it("parses 'group by note'", () => {
    const { grouping, errors } = parse_task_query("group by note");
    expect(errors).toEqual([]);
    expect(grouping).toBe("note");
  });

  it("parses 'limit 20'", () => {
    const { query, errors } = parse_task_query("limit 20");
    expect(errors).toEqual([]);
    expect(query.limit).toBe(20);
  });

  it("ignores blank lines and comments", () => {
    const input = `
# My task query
not done

# Filter by path
path includes daily/
`;
    const { query, errors } = parse_task_query(input);
    expect(errors).toEqual([]);
    expect(query.filters).toHaveLength(2);
  });

  it("strips inline comments", () => {
    const { query, errors } = parse_task_query("not done # only open tasks");
    expect(errors).toEqual([]);
    expect(query.filters).toEqual([
      { property: "status", operator: "neq", value: "done" },
    ]);
  });

  it("combines multiple clauses", () => {
    const input = `not done
section includes Shopping
due before 2026-05-01
sort by due_date
group by status
limit 20`;
    const { query, grouping, errors } = parse_task_query(input);
    expect(errors).toEqual([]);
    expect(query.filters).toHaveLength(3);
    expect(query.sort).toEqual([{ property: "due_date", descending: false }]);
    expect(grouping).toBe("status");
    expect(query.limit).toBe(20);
  });

  it("reports errors for unknown clauses", () => {
    const { errors } = parse_task_query("foobar baz");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Unknown clause");
  });

  it("reports error for invalid sort property", () => {
    const { errors } = parse_task_query("sort by invalid_prop");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Unknown sort property");
  });

  it("reports error for invalid group property", () => {
    const { errors } = parse_task_query("group by invalid_prop");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Unknown group property");
  });

  it("reports error for invalid due date format", () => {
    const { errors } = parse_task_query("due before not-a-date");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Invalid due clause");
  });

  it("returns defaults for empty input", () => {
    const { query, grouping, errors } = parse_task_query("");
    expect(errors).toEqual([]);
    expect(query.filters).toEqual([]);
    expect(query.sort).toEqual([]);
    expect(query.limit).toBe(0);
    expect(query.offset).toBe(0);
    expect(grouping).toBe("none");
  });
});
