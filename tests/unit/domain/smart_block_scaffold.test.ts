import { describe, expect, it } from "vitest";
import { smart_block_scaffold } from "$lib/features/smart_blocks/domain/smart_block_scaffold";
import { parse_base_view_spec } from "$lib/features/smart_blocks/domain/base_view_spec";
import { parse_query } from "$lib/features/query/domain/query_parser";

function fenced_body(scaffold: string, type: string): string {
  const lines = scaffold.split("\n");
  expect(lines[0]).toBe(`\`\`\`${type}`);
  expect(lines.at(-1)).toBe("```");
  return lines.slice(1, -1).join("\n");
}

describe("smart_block_scaffold", () => {
  it("wraps each type in a matching fenced block", () => {
    expect(smart_block_scaffold("query").startsWith("```query\n")).toBe(true);
    expect(smart_block_scaffold("base").startsWith("```base\n")).toBe(true);
    expect(smart_block_scaffold("backlinks")).toBe("```backlinks\n```");
  });

  it("produces a base scaffold that parses into a valid, renderable spec", () => {
    const body = fenced_body(smart_block_scaffold("base"), "base");
    const result = parse_base_view_spec(body);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.spec.view).toBe("table");
      expect(result.spec.query.length).toBeGreaterThan(0);
    }
  });

  it("produces a query scaffold whose body parses with the real query parser", () => {
    const body = fenced_body(smart_block_scaffold("query"), "query");
    expect(parse_query(body).ok).toBe(true);
  });

  it("produces a base scaffold whose query line parses with the real query parser", () => {
    const body = fenced_body(smart_block_scaffold("base"), "base");
    const result = parse_base_view_spec(body);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(parse_query(result.spec.query).ok).toBe(true);
    }
  });
});
