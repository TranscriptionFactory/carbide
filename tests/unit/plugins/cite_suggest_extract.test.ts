import { describe, it, expect } from "vitest";
import { extract_cite_query } from "$lib/features/editor/adapters/cite_suggest_plugin";

describe("extract_cite_query", () => {
  it("detects trigger at start of text", () => {
    expect(extract_cite_query("[@smith")).toEqual({
      query: "smith",
      from_offset: 0,
    });
  });

  it("detects trigger with preceding text", () => {
    expect(extract_cite_query("some text [@doe")).toEqual({
      query: "doe",
      from_offset: 10,
    });
  });

  it("detects empty query after trigger", () => {
    expect(extract_cite_query("[@")).toEqual({
      query: "",
      from_offset: 0,
    });
  });

  it("returns null when bracket is closed", () => {
    expect(extract_cite_query("[@smith]")).toBeNull();
  });

  it("returns null for wikilink-style [[@", () => {
    expect(extract_cite_query("[[@smith")).toBeNull();
  });

  it("returns null when query contains newline", () => {
    expect(extract_cite_query("[@smith\nmore")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extract_cite_query("")).toBeNull();
  });

  it("returns null for plain text without trigger", () => {
    expect(extract_cite_query("plain text")).toBeNull();
  });

  it("returns null for bracket without @", () => {
    expect(extract_cite_query("[something")).toBeNull();
  });
});
