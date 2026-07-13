import { describe, it, expect } from "vitest";
import {
  build_task_query_text,
  type TaskQueryBuilderSpec,
} from "$lib/features/task/domain/task_query_builder";
import { parse_task_query } from "$lib/features/task/parse_task_query";

function expect_no_errors(text: string) {
  const result = parse_task_query(text);
  expect(result.errors, `errors for: ${text}`).toEqual([]);
}

describe("build_task_query_text", () => {
  it("emits one clause per line", () => {
    const spec: TaskQueryBuilderSpec = {
      clauses: [
        { kind: "status", status: "todo" },
        { kind: "due", due: { kind: "today" } },
      ],
    };
    expect(build_task_query_text(spec)).toBe("status is todo\ndue today");
  });

  it("appends sort and group lines", () => {
    const spec: TaskQueryBuilderSpec = {
      clauses: [{ kind: "status", status: "doing" }],
      sort: [{ property: "due_date", descending: true }],
      group_by: "status",
    };
    expect(build_task_query_text(spec)).toBe(
      "status is doing\nsort by due_date desc\ngroup by status",
    );
  });

  it("omits the group line when grouping is none", () => {
    const spec: TaskQueryBuilderSpec = {
      clauses: [{ kind: "status", status: "done" }],
      group_by: "none",
    };
    expect(build_task_query_text(spec)).toBe("status is done");
  });

  describe("round-trips through the parser", () => {
    it("parses every status", () => {
      for (const status of ["todo", "doing", "done"] as const) {
        expect_no_errors(
          build_task_query_text({ clauses: [{ kind: "status", status }] }),
        );
      }
    });

    it("parses every due comparator", () => {
      const dues: TaskQueryBuilderSpec["clauses"] = [
        { kind: "due", due: { kind: "today" } },
        { kind: "due", due: { kind: "this_week" } },
        { kind: "due", due: { kind: "last_week" } },
        { kind: "due", due: { kind: "next_days", days: 7 } },
        { kind: "due", due: { kind: "before", date: "2026-01-01" } },
        { kind: "due", due: { kind: "after", date: "2026-12-31" } },
        { kind: "due", due: { kind: "on", date: "2026-06-15" } },
      ];
      for (const clause of dues) {
        expect_no_errors(build_task_query_text({ clauses: [clause] }));
      }
    });

    it("parses tag, path, and text clauses", () => {
      const spec: TaskQueryBuilderSpec = {
        clauses: [
          { kind: "tag", tag: "#urgent" },
          { kind: "path", text: "projects/carbide" },
          { kind: "text", text: "follow up" },
        ],
      };
      expect_no_errors(build_task_query_text(spec));
    });

    it("parses section clauses", () => {
      const specs: TaskQueryClauseList = [
        { kind: "section", match: "is", heading: "Backlog" },
        { kind: "section", match: "under", heading: "Planning" },
        {
          kind: "section",
          match: "under",
          heading: "Planning",
          include_subheadings: false,
        },
      ];
      for (const clause of specs) {
        expect_no_errors(build_task_query_text({ clauses: [clause] }));
      }
    });

    it("parses every sortable and groupable property", () => {
      const sortable = ["status", "text", "path", "due_date", "section"];
      for (const property of sortable) {
        expect_no_errors(
          build_task_query_text({ clauses: [], sort: [{ property }] }),
        );
      }
      const groupable = ["status", "note", "section", "due_date"] as const;
      for (const group_by of groupable) {
        expect_no_errors(build_task_query_text({ clauses: [], group_by }));
      }
    });

    it("parses a full multi-clause query", () => {
      const spec: TaskQueryBuilderSpec = {
        clauses: [
          { kind: "status", status: "todo" },
          { kind: "due", due: { kind: "next_days", days: 3 } },
          { kind: "tag", tag: "#work" },
          { kind: "section", match: "under", heading: "Sprint" },
        ],
        sort: [{ property: "due_date" }],
        group_by: "note",
      };
      expect_no_errors(build_task_query_text(spec));
    });
  });
});

type TaskQueryClauseList = TaskQueryBuilderSpec["clauses"];
