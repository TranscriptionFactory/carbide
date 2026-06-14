import { describe, expect, it } from "vitest";
import { parse_smart_block } from "$lib/features/smart_blocks";

describe("parse_smart_block", () => {
  it("uses the language as the block type", () => {
    const spec = parse_smart_block("tasks", "not done");
    expect(spec.type).toBe("tasks");
  });

  it("preserves the body verbatim, including internal whitespace and newlines", () => {
    const body = "view: kanban\ngroup_by: status\n  query: notes";
    const spec = parse_smart_block("base", body);
    expect(spec.body).toBe(body);
  });

  it("trims surrounding whitespace from the language token", () => {
    const spec = parse_smart_block("  query  ", "named:spec");
    expect(spec.type).toBe("query");
  });

  it("does not throw on an empty body", () => {
    const spec = parse_smart_block("backlinks", "");
    expect(spec).toEqual({ type: "backlinks", body: "" });
  });
});
