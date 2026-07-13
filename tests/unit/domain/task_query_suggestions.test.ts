import { describe, it, expect } from "vitest";
import { suggest_task_query } from "$lib/features/task/domain/task_query_suggestions";
import type { DslContext } from "$lib/shared/types/dsl_suggestion";

const empty_ctx: DslContext = {};

function labels(text: string, ctx: DslContext = empty_ctx): string[] {
  return suggest_task_query(text, ctx).items.map((i) => i.label);
}

describe("suggest_task_query", () => {
  describe("first token", () => {
    it("offers clause starters on an empty line", () => {
      const l = labels("");
      expect(l).toContain("is");
      expect(l).toContain("path");
      expect(l).toContain("due");
      expect(l).toContain("sort");
      expect(l).toContain("group");
      expect(l).toContain("NOT");
      expect(l).toContain("(");
    });

    it("filters clause starters by prefix", () => {
      const l = labels("s");
      expect(l).toContain("section");
      expect(l).toContain("sort");
      expect(l).toContain("status");
      expect(l).not.toContain("path");
    });

    it("is case-insensitive on the partial token", () => {
      expect(labels("SO")).toContain("sort");
    });
  });

  describe("follow sets", () => {
    it("offers statuses after `is `", () => {
      expect(labels("is ")).toEqual(["todo", "doing", "done"]);
    });

    it("offers done after `not `", () => {
      expect(labels("not ")).toEqual(["done"]);
    });

    it("offers includes after path/section/text", () => {
      expect(labels("path ")).toEqual(["includes"]);
      expect(labels("section ")).toEqual(["includes"]);
      expect(labels("text ")).toEqual(["includes"]);
    });

    it("offers due comparators after `due `", () => {
      const l = labels("due ");
      expect(l).toContain("before");
      expect(l).toContain("after");
      expect(l).toContain("on");
      expect(l).toContain("today");
      expect(l).toContain("this week");
      expect(l).toContain("last week");
    });

    it("offers due date after `has `", () => {
      expect(labels("has ")).toContain("due date");
    });

    it("offers sortable props after `sort by `", () => {
      const l = labels("sort by ");
      expect(l).toEqual(["status", "text", "path", "due_date", "section"]);
    });

    it("offers groupable props after `group by `", () => {
      const l = labels("group by ");
      expect(l).toEqual(["status", "note", "section", "due_date"]);
    });

    it("offers ctx tags after `tag includes `", () => {
      const l = labels("tag includes ", { tags: ["urgent", "#home"] });
      expect(l).toEqual(["#urgent", "#home"]);
    });

    it("prefix-filters sortable props", () => {
      expect(labels("sort by s")).toEqual(["status", "section"]);
    });
  });

  describe("connectives after a complete clause", () => {
    it("offers connectives after a finished atom", () => {
      const l = labels("is done ");
      expect(l).toEqual(["AND", "OR", "NOT", "("]);
    });
  });

  describe("comment lines", () => {
    it("returns no items on a comment line", () => {
      expect(suggest_task_query("# just a note", empty_ctx).items).toEqual([]);
    });

    it("treats trailing comment as a comment", () => {
      expect(suggest_task_query("is done # note", empty_ctx).items).toEqual([]);
    });

    it("does not treat #tag (no space) as a comment", () => {
      expect(labels("tag includes #", { tags: ["a"] })).toEqual(["#a"]);
    });
  });

  describe("per-line independence", () => {
    it("only considers the current line", () => {
      const l = labels("is done\ndue ");
      expect(l).toContain("before");
      expect(l).not.toContain("todo");
    });

    it("earlier lines do not leak state into the current line", () => {
      const l = labels("sort by status\n");
      expect(l).toContain("is");
      expect(l).toContain("path");
    });
  });

  describe("from offsets", () => {
    it("points `from` at the start of the current partial token", () => {
      const text = "is do";
      const r = suggest_task_query(text, empty_ctx);
      expect(r.from).toBe(3);
      expect(text.slice(r.from)).toBe("do");
    });

    it("points `from` at cursor when at a word boundary", () => {
      const text = "is ";
      const r = suggest_task_query(text, empty_ctx);
      expect(r.from).toBe(text.length);
    });

    it("computes offsets across multiple lines", () => {
      const text = "is done\nsort by st";
      const r = suggest_task_query(text, empty_ctx);
      expect(text.slice(r.from)).toBe("st");
      expect(r.items.map((i) => i.label)).toEqual(["status"]);
    });
  });
});
