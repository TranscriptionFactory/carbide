import { describe, expect, it } from "vitest";
import {
  changed_files_from_tools,
  is_mutating_call,
  is_mutating_tool,
  paths_from_call,
  to_vault_relative_path,
} from "$lib/features/assistant/domain/agent_file_ops";

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

describe("is_mutating_call", () => {
  it("trusts the harness flag over the tool name", () => {
    expect(
      is_mutating_call({
        name: "file_change",
        input_summary: "",
        mutating: true,
      }),
    ).toBe(true);
    expect(
      is_mutating_call({
        name: "Write",
        input_summary: "",
        mutating: false,
      }),
    ).toBe(false);
  });

  it("falls back to the tool name when no flag is present", () => {
    expect(is_mutating_call({ name: "Write", input_summary: "" })).toBe(true);
    expect(is_mutating_call({ name: "Read", input_summary: "" })).toBe(false);
  });
});

describe("paths_from_call", () => {
  it("prefers the structured paths over the summary", () => {
    expect(
      paths_from_call({
        name: "Write",
        input_summary: '{"file_path":"summary.md"}',
        paths: ["structured.md"],
      }),
    ).toEqual(["structured.md"]);
  });

  it("falls back to parsing the summary when no structured paths arrived", () => {
    expect(
      paths_from_call({
        name: "Write",
        input_summary: '{"file_path":"summary.md"}',
        paths: [],
      }),
    ).toEqual(["summary.md"]);
  });

  // NotebookEdit is mutating on both sides, so the fallback has to know the key
  // Rust harvests. src-tauri/tests/mcp_mutating_parity.rs pins the two lists.
  it("reads every path key the harness extracts, including notebook_path", () => {
    expect(
      paths_from_call({
        name: "NotebookEdit",
        input_summary: '{"notebook_path":"notes/analysis.ipynb"}',
      }),
    ).toEqual(["notes/analysis.ipynb"]);
  });
});

describe("to_vault_relative_path", () => {
  it("strips the vault root from harness absolute paths", () => {
    expect(
      to_vault_relative_path("/vault/demo", "/vault/demo/notes/a.md"),
    ).toBe("notes/a.md");
  });

  it("leaves already-relative paths alone", () => {
    expect(to_vault_relative_path("/vault/demo", "notes/a.md")).toBe(
      "notes/a.md",
    );
    expect(to_vault_relative_path("/vault/demo", "./notes/a.md")).toBe(
      "notes/a.md",
    );
  });

  it("leaves paths outside the vault alone", () => {
    expect(to_vault_relative_path("/vault/demo", "/etc/hosts")).toBe(
      "/etc/hosts",
    );
  });

  it("normalizes windows separators and a trailing vault slash", () => {
    expect(
      to_vault_relative_path("C:/vault/demo/", "C:\\vault\\demo\\notes\\a.md"),
    ).toBe("notes/a.md");
  });
});

describe("changed_files_from_tools", () => {
  it("extracts file paths from JSON input summaries", () => {
    const changed = changed_files_from_tools(
      [
        {
          name: "mcp__carbide__update_note",
          input_summary: '{"vault_id":"v1","path":"notes/a.md"}',
        },
        {
          name: "Write",
          input_summary: '{"file_path":"notes/b.md","content":"…"}',
        },
      ],
      "/vault/demo",
    );
    expect(changed).toEqual(["notes/a.md", "notes/b.md"]);
  });

  it("collects both paths from a rename", () => {
    const changed = changed_files_from_tools(
      [
        {
          name: "mcp__carbide__rename_note",
          input_summary: '{"old_path":"notes/a.md","new_path":"notes/b.md"}',
        },
      ],
      "/vault/demo",
    );
    expect(changed).toEqual(["notes/a.md", "notes/b.md"]);
  });

  it("skips read-only tools", () => {
    const changed = changed_files_from_tools(
      [
        {
          name: "mcp__carbide__read_note",
          input_summary: '{"path":"notes/a.md"}',
        },
        { name: "Read", input_summary: '{"file_path":"notes/b.md"}' },
      ],
      "/vault/demo",
    );
    expect(changed).toEqual([]);
  });

  it("deduplicates while preserving first-seen order", () => {
    const changed = changed_files_from_tools(
      [
        { name: "Edit", input_summary: '{"file_path":"notes/b.md"}' },
        {
          name: "mcp__carbide__update_note",
          input_summary: '{"path":"notes/a.md"}',
        },
        { name: "Edit", input_summary: '{"file_path":"notes/b.md"}' },
      ],
      "/vault/demo",
    );
    expect(changed).toEqual(["notes/b.md", "notes/a.md"]);
  });

  it("accepts a bare path summary", () => {
    const changed = changed_files_from_tools(
      [{ name: "Write", input_summary: "notes/b.md" }],
      "/vault/demo",
    );
    expect(changed).toEqual(["notes/b.md"]);
  });

  it("skips empty summaries", () => {
    const changed = changed_files_from_tools(
      [{ name: "Write", input_summary: "  " }],
      "/vault/demo",
    );
    expect(changed).toEqual([]);
  });

  // Regression: the 200-char input summary truncates mid-JSON and the path was
  // silently lost. The harness now sends the paths structurally.
  it("recovers paths a truncated summary destroyed", () => {
    const changed = changed_files_from_tools(
      [
        {
          name: "Write",
          input_summary: '{"content":"aaaaaaaaaa…',
          paths: ["/vault/demo/notes/trunc.md"],
          mutating: true,
        },
      ],
      "/vault/demo",
    );
    expect(changed).toEqual(["notes/trunc.md"]);
  });

  it("captures every path of a MultiEdit whose summary was truncated", () => {
    const changed = changed_files_from_tools(
      [
        {
          name: "MultiEdit",
          input_summary: '{"edits":[{"new_string":"aaaa…',
          paths: [
            "/vault/demo/notes/a.md",
            "/vault/demo/notes/b.md",
            "/vault/demo/notes/c.md",
          ],
          mutating: true,
        },
      ],
      "/vault/demo",
    );
    expect(changed).toEqual(["notes/a.md", "notes/b.md", "notes/c.md"]);
  });

  it("still yields nothing when a mutating call resolves no path at all", () => {
    const changed = changed_files_from_tools(
      [
        {
          name: "Write",
          input_summary: '{"file_path":"notes/trunc',
          paths: [],
          mutating: true,
        },
      ],
      "/vault/demo",
    );
    expect(changed).toEqual([]);
  });
});
