import { describe, expect, it } from "vitest";
import { ParsedNoteCache } from "$lib/features/note/state/parsed_note_cache.svelte";
function make_parsed(title: string): Record<string, unknown> {
  return { title };
}

describe("ParsedNoteCache", () => {
  it("starts empty", () => {
    const cache = new ParsedNoteCache();
    expect(cache.get("any.md")).toBeUndefined();
  });

  it("stores and retrieves parsed note", () => {
    const cache = new ParsedNoteCache();
    const parsed = make_parsed("Hello");
    cache.set("hello.md", parsed);
    expect(cache.get("hello.md")).toBe(parsed);
  });

  it("overwrites on re-set", () => {
    const cache = new ParsedNoteCache();
    cache.set("a.md", make_parsed("V1"));
    const v2 = make_parsed("V2");
    cache.set("a.md", v2);
    expect(cache.get("a.md")).toBe(v2);
  });

  it("invalidates a single entry", () => {
    const cache = new ParsedNoteCache();
    cache.set("a.md", make_parsed("A"));
    cache.set("b.md", make_parsed("B"));

    cache.invalidate("a.md");

    expect(cache.get("a.md")).toBeUndefined();
    expect(cache.get("b.md")).toBeDefined();
  });

  it("clears all entries", () => {
    const cache = new ParsedNoteCache();
    cache.set("a.md", make_parsed("A"));
    cache.set("b.md", make_parsed("B"));

    cache.clear();

    expect(cache.get("a.md")).toBeUndefined();
    expect(cache.get("b.md")).toBeUndefined();
  });
});
