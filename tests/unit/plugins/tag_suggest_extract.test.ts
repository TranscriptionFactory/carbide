import { describe, it, expect } from "vitest";
import { extract_tag_query } from "$lib/features/editor/adapters/tag_suggest_plugin";

describe("extract_tag_query", () => {
  it("returns query from a bare hash at start", () => {
    expect(extract_tag_query("#pro")).toEqual({ query: "pro", offset: 0 });
  });

  it("returns query from a hash preceded by a space", () => {
    expect(extract_tag_query("text #tag")).toEqual({ query: "tag", offset: 5 });
  });

  it("handles hierarchical tag paths", () => {
    expect(extract_tag_query("#project/car")).toEqual({
      query: "project/car",
      offset: 0,
    });
  });

  it("returns empty query for lone hash (show all)", () => {
    expect(extract_tag_query("#")).toEqual({ query: "", offset: 0 });
  });

  it("returns null for heading syntax ##", () => {
    expect(extract_tag_query("##")).toBeNull();
  });

  it("returns null for heading line", () => {
    expect(extract_tag_query("# heading")).toBeNull();
  });

  it("returns null when hash is not preceded by space", () => {
    expect(extract_tag_query("text#tag")).toBeNull();
  });

  it("returns null when there is a space in the tag text", () => {
    expect(extract_tag_query("#tag with space")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extract_tag_query("")).toBeNull();
  });

  it("returns null when hash appears inside a wiki link anchor", () => {
    expect(extract_tag_query("text [[#anchor]]")).toBeNull();
  });
});
