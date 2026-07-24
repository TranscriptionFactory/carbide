import { describe, expect, it } from "vitest";
import {
  citations_from_tools,
  is_citation_source_tool,
} from "$lib/features/rag/domain/agent_citations";

describe("is_citation_source_tool", () => {
  it("accepts path-bearing carbide read tools", () => {
    expect(is_citation_source_tool("mcp__carbide__read_note")).toBe(true);
    expect(is_citation_source_tool("mcp__carbide__get_note_metadata")).toBe(
      true,
    );
    expect(is_citation_source_tool("Read")).toBe(true);
  });

  it("rejects non-source tools", () => {
    expect(is_citation_source_tool("mcp__carbide__search_notes")).toBe(false);
    expect(is_citation_source_tool("mcp__carbide__list_notes")).toBe(false);
    expect(is_citation_source_tool("mcp__carbide__update_note")).toBe(false);
    expect(is_citation_source_tool("Write")).toBe(false);
    expect(is_citation_source_tool("mcp__other__read_note")).toBe(false);
  });
});

describe("citations_from_tools", () => {
  it("derives a citation from a single read_note call", () => {
    const citations = citations_from_tools([
      {
        name: "mcp__carbide__read_note",
        input_summary: '{"vault_id":"v1","path":"notes/a.md"}',
      },
    ]);
    expect(citations).toEqual([
      { index: 1, note_path: "notes/a.md", title: "a" },
    ]);
  });

  it("numbers and orders multiple distinct notes by first appearance", () => {
    const citations = citations_from_tools([
      { name: "mcp__carbide__read_note", input_summary: '{"path":"b.md"}' },
      { name: "Read", input_summary: '{"file_path":"sub/A Note.md"}' },
    ]);
    expect(citations).toEqual([
      { index: 1, note_path: "b.md", title: "b" },
      { index: 2, note_path: "sub/A Note.md", title: "A Note" },
    ]);
  });

  it("deduplicates repeated note paths", () => {
    const citations = citations_from_tools([
      { name: "mcp__carbide__read_note", input_summary: '{"path":"a.md"}' },
      { name: "Read", input_summary: '{"file_path":"a.md"}' },
    ]);
    expect(citations).toEqual([{ index: 1, note_path: "a.md", title: "a" }]);
  });

  it("excludes mutating tools even when they carry a path", () => {
    const citations = citations_from_tools([
      {
        name: "mcp__carbide__update_note",
        input_summary: '{"path":"a.md","content":"…"}',
      },
      { name: "Write", input_summary: '{"file_path":"b.md"}' },
    ]);
    expect(citations).toEqual([]);
  });

  it("ignores read tools whose input carries no path (query-only)", () => {
    const citations = citations_from_tools([
      { name: "mcp__carbide__search_notes", input_summary: '{"query":"foo"}' },
    ]);
    expect(citations).toEqual([]);
  });

  it("falls back to no citation when a JSON summary is truncated", () => {
    const citations = citations_from_tools([
      { name: "mcp__carbide__read_note", input_summary: '{"path":"notes/tr' },
    ]);
    expect(citations).toEqual([]);
  });
});
