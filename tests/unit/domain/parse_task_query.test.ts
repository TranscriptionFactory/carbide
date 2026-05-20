import { describe, expect, it } from "vitest";
import { parse_task_query } from "$lib/features/task/parse_task_query";
import type { FilterExpr } from "$lib/features/task/types";

function atom(
  property: string,
  operator: string,
  value: string,
): FilterExpr {
  return { type: "atom", filter: { property, operator: operator as any, value } };
}

describe("parse_task_query", () => {
  it("parses 'not done'", () => {
    const { query, errors } = parse_task_query("not done");
    expect(errors).toEqual([]);
    expect(query.filter).toEqual(atom("status", "neq", "done"));
  });

  it("parses 'done'", () => {
    const { query, errors } = parse_task_query("done");
    expect(errors).toEqual([]);
    expect(query.filter).toEqual(atom("status", "eq", "done"));
  });

  it("parses 'status is todo'", () => {
    const { query, errors } = parse_task_query("status is todo");
    expect(errors).toEqual([]);
    expect(query.filter).toEqual(atom("status", "eq", "todo"));
  });

  it("parses 'status is doing'", () => {
    const { query, errors } = parse_task_query("status is doing");
    expect(errors).toEqual([]);
    expect(query.filter).toEqual(atom("status", "eq", "doing"));
  });

  it("parses 'path includes daily/'", () => {
    const { query, errors } = parse_task_query("path includes daily/");
    expect(errors).toEqual([]);
    expect(query.filter).toEqual(atom("path", "contains", "daily/"));
  });

  it("parses 'section includes Shopping'", () => {
    const { query, errors } = parse_task_query("section includes Shopping");
    expect(errors).toEqual([]);
    expect(query.filter).toEqual(atom("section", "contains", "Shopping"));
  });

  it("parses 'text includes urgent'", () => {
    const { query, errors } = parse_task_query("text includes urgent");
    expect(errors).toEqual([]);
    expect(query.filter).toEqual(atom("text", "contains", "urgent"));
  });

  it("parses 'due before <date>'", () => {
    const { query, errors } = parse_task_query("due before 2026-05-01");
    expect(errors).toEqual([]);
    expect(query.filter).toEqual(atom("due_date", "lt", "2026-05-01"));
  });

  it("parses 'due after <date>'", () => {
    const { query, errors } = parse_task_query("due after 2026-01-01");
    expect(errors).toEqual([]);
    expect(query.filter).toEqual(atom("due_date", "gt", "2026-01-01"));
  });

  it("parses 'due on <date>'", () => {
    const { query, errors } = parse_task_query("due on 2026-04-24");
    expect(errors).toEqual([]);
    expect(query.filter).toEqual(atom("due_date", "eq", "2026-04-24"));
  });

  it("parses 'due today'", () => {
    const { query, errors } = parse_task_query("due today");
    expect(errors).toEqual([]);
    expect(query.filter).not.toBeNull();
    expect(query.filter!.type).toBe("atom");
    const f = (query.filter as { type: "atom"; filter: any }).filter;
    expect(f.property).toBe("due_date");
    expect(f.operator).toBe("eq");
    expect(f.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("parses 'has due date'", () => {
    const { query, errors } = parse_task_query("has due date");
    expect(errors).toEqual([]);
    expect(query.filter).toEqual(atom("due_date", "neq", ""));
  });

  it("parses 'no due date'", () => {
    const { query, errors } = parse_task_query("no due date");
    expect(errors).toEqual([]);
    expect(query.filter).toEqual(atom("due_date", "eq", ""));
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
    expect(query.filter).not.toBeNull();
    expect(query.filter!.type).toBe("and");
    expect((query.filter as any).operands).toHaveLength(2);
  });

  it("strips inline comments", () => {
    const { query, errors } = parse_task_query("not done # only open tasks");
    expect(errors).toEqual([]);
    expect(query.filter).toEqual(atom("status", "neq", "done"));
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
    expect(query.filter).not.toBeNull();
    expect(query.filter!.type).toBe("and");
    expect((query.filter as any).operands).toHaveLength(3);
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
    expect(query.filter).toBeNull();
    expect(query.sort).toEqual([]);
    expect(query.limit).toBe(0);
    expect(query.offset).toBe(0);
    expect(grouping).toBe("none");
  });

  // Boolean operator tests
  it("parses OR expression", () => {
    const { query, errors } = parse_task_query(
      "(section includes urgent) OR (section includes reminders)",
    );
    expect(errors).toEqual([]);
    expect(query.filter).toEqual({
      type: "or",
      operands: [
        atom("section", "contains", "urgent"),
        atom("section", "contains", "reminders"),
      ],
    });
  });

  it("parses AND expression", () => {
    const { query, errors } = parse_task_query(
      "(status is todo) AND (due before 2026-05-01)",
    );
    expect(errors).toEqual([]);
    expect(query.filter).toEqual({
      type: "and",
      operands: [
        atom("status", "eq", "todo"),
        atom("due_date", "lt", "2026-05-01"),
      ],
    });
  });

  it("parses NOT expression", () => {
    const { query, errors } = parse_task_query("NOT (status is done)");
    expect(errors).toEqual([]);
    expect(query.filter).toEqual({
      type: "not",
      operand: atom("status", "eq", "done"),
    });
  });

  it("parses mixed multi-line with boolean and simple", () => {
    const input = `(section includes urgent) OR (section includes reminders)
not done`;
    const { query, errors } = parse_task_query(input);
    expect(errors).toEqual([]);
    expect(query.filter).not.toBeNull();
    expect(query.filter!.type).toBe("and");
    const operands = (query.filter as any).operands;
    expect(operands).toHaveLength(2);
    expect(operands[0].type).toBe("or");
    expect(operands[1].type).toBe("atom");
  });

  it("parses nested boolean: ((a) AND (b)) OR (c)", () => {
    const { query, errors } = parse_task_query(
      "((status is todo) AND (path includes projects)) OR (section includes urgent)",
    );
    expect(errors).toEqual([]);
    expect(query.filter).not.toBeNull();
    expect(query.filter!.type).toBe("or");
    const operands = (query.filter as any).operands;
    expect(operands).toHaveLength(2);
    expect(operands[0].type).toBe("and");
    expect(operands[1].type).toBe("atom");
  });

  it("reports error for unmatched parens", () => {
    const { errors } = parse_task_query("(section includes urgent");
    expect(errors).toHaveLength(1);
  });

  it("reports error for dangling operator", () => {
    const { errors } = parse_task_query("(status is todo) OR");
    expect(errors).toHaveLength(1);
  });
});
