import { describe, expect, it } from "vitest";
import {
  changed_files_from_tools,
  is_mutating_tool,
} from "$lib/features/rag/domain/agent_file_ops";

describe("is_mutating_tool", () => {
  it("detects mutating carbide MCP tools", () => {
    expect(is_mutating_tool("mcp__carbide__create_note")).toBe(true);
    expect(is_mutating_tool("mcp__carbide__update_note")).toBe(true);
    expect(is_mutating_tool("mcp__carbide__edit_note")).toBe(true);
    expect(is_mutating_tool("mcp__carbide__delete_note")).toBe(true);
    expect(is_mutating_tool("mcp__carbide__append_note")).toBe(true);
    expect(is_mutating_tool("mcp__carbide__prepend_note")).toBe(true);
    expect(is_mutating_tool("mcp__carbide__ensure_frontmatter")).toBe(true);
    expect(is_mutating_tool("mcp__carbide__rename_note")).toBe(true);
  });

  it("ignores read-only carbide MCP tools", () => {
    expect(is_mutating_tool("mcp__carbide__read_note")).toBe(false);
    expect(is_mutating_tool("mcp__carbide__search_notes")).toBe(false);
    expect(is_mutating_tool("mcp__carbide__list_notes")).toBe(false);
    expect(is_mutating_tool("mcp__carbide__git_status")).toBe(false);
  });

  it("detects built-in file-writing tools", () => {
    expect(is_mutating_tool("Write")).toBe(true);
    expect(is_mutating_tool("Edit")).toBe(true);
    expect(is_mutating_tool("MultiEdit")).toBe(true);
    expect(is_mutating_tool("NotebookEdit")).toBe(true);
  });

  it("ignores read-only built-in tools", () => {
    expect(is_mutating_tool("Read")).toBe(false);
    expect(is_mutating_tool("Bash")).toBe(false);
    expect(is_mutating_tool("Grep")).toBe(false);
  });

  it("ignores mutating tool names from other MCP servers", () => {
    expect(is_mutating_tool("mcp__other__update_note")).toBe(false);
  });
});

describe("changed_files_from_tools", () => {
  it("extracts file paths from JSON input summaries", () => {
    const changed = changed_files_from_tools([
      {
        name: "mcp__carbide__update_note",
        input_summary: '{"vault_id":"v1","path":"notes/a.md"}',
      },
      {
        name: "Write",
        input_summary: '{"file_path":"notes/b.md","content":"…"}',
      },
    ]);
    expect(changed).toEqual(["notes/a.md", "notes/b.md"]);
  });

  it("collects both paths from a rename", () => {
    const changed = changed_files_from_tools([
      {
        name: "mcp__carbide__rename_note",
        input_summary: '{"old_path":"notes/a.md","new_path":"notes/b.md"}',
      },
    ]);
    expect(changed).toEqual(["notes/a.md", "notes/b.md"]);
  });

  it("skips read-only tools", () => {
    const changed = changed_files_from_tools([
      {
        name: "mcp__carbide__read_note",
        input_summary: '{"path":"notes/a.md"}',
      },
      { name: "Read", input_summary: '{"file_path":"notes/b.md"}' },
    ]);
    expect(changed).toEqual([]);
  });

  it("deduplicates while preserving first-seen order", () => {
    const changed = changed_files_from_tools([
      { name: "Edit", input_summary: '{"file_path":"notes/b.md"}' },
      {
        name: "mcp__carbide__update_note",
        input_summary: '{"path":"notes/a.md"}',
      },
      { name: "Edit", input_summary: '{"file_path":"notes/b.md"}' },
    ]);
    expect(changed).toEqual(["notes/b.md", "notes/a.md"]);
  });

  it("accepts a bare path summary", () => {
    const changed = changed_files_from_tools([
      { name: "Write", input_summary: "notes/b.md" },
    ]);
    expect(changed).toEqual(["notes/b.md"]);
  });

  it("skips empty and truncation-broken summaries", () => {
    const changed = changed_files_from_tools([
      { name: "Write", input_summary: "  " },
      { name: "Write", input_summary: '{"file_path":"notes/trunc' },
    ]);
    expect(changed).toEqual([]);
  });
});
