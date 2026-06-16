import { describe, expect, it } from "vitest";
import { smart_block_body } from "$lib/features/smart_blocks/domain/smart_block_scaffold";
import { parse_base_view_spec } from "$lib/features/smart_blocks/domain/base_view_spec";
import { parse_query } from "$lib/features/query/domain/query_parser";

describe("smart_block_body", () => {
  it("returns an empty body for backlinks", () => {
    expect(smart_block_body("backlinks")).toBe("");
  });

  it("produces a query body that parses with the real query parser", () => {
    expect(parse_query(smart_block_body("query")).ok).toBe(true);
  });

  it("produces a base body that parses into a valid, renderable spec", () => {
    const result = parse_base_view_spec(smart_block_body("base"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.spec.view).toBe("table");
      expect(parse_query(result.spec.query).ok).toBe(true);
    }
  });

  it("produces a non-empty tasks body", () => {
    expect(smart_block_body("tasks").length).toBeGreaterThan(0);
  });
});
