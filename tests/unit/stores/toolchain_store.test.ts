import { describe, it, expect } from "vitest";
import { ToolchainStore } from "$lib/features/toolchain/state/toolchain_store.svelte";
import type { ToolInfo } from "$lib/features/toolchain/types";

function make_tool(id: string, overrides?: Partial<ToolInfo>): ToolInfo {
  return {
    id,
    display_name: id,
    github_repo: `org/${id}`,
    version: "1.0.0",
    status: { type: "installed", version: "1.0.0", path: `/bin/${id}` },
    capabilities: [],
    ...overrides,
  };
}

describe("ToolchainStore", () => {
  it("set_tools populates map", () => {
    const store = new ToolchainStore();
    store.set_tools([make_tool("a"), make_tool("b")]);
    expect(store.tools.size).toBe(2);
    expect(store.get_tool("a")?.id).toBe("a");
  });

  it("update_status replaces status immutably", () => {
    const store = new ToolchainStore();
    store.set_tools([make_tool("a")]);
    const before = store.get_tool("a");
    store.update_status("a", { type: "error", message: "oops" });
    const after = store.get_tool("a");
    expect(after?.status).toEqual({ type: "error", message: "oops" });
    expect(after).not.toBe(before);
  });

  it("update_status ignores unknown tool", () => {
    const store = new ToolchainStore();
    store.update_status("missing", { type: "not_installed" });
    expect(store.tools.size).toBe(0);
  });

  it("tools_with_capability returns tools matching capability type", () => {
    const store = new ToolchainStore();
    store.set_tools([
      make_tool("linter", {
        capabilities: [
          { type: "document_sync", debounce_ms: 300, skip_draft: false },
          { type: "diagnostics" },
          { type: "formatting" },
        ],
      }),
      make_tool("editor", {
        capabilities: [
          { type: "document_sync", debounce_ms: 500, skip_draft: true },
          { type: "completion" },
          { type: "hover" },
        ],
      }),
      make_tool("static_tool", {
        capabilities: [{ type: "formatting" }],
      }),
    ]);

    const sync_tools = store.tools_with_capability("document_sync");
    expect(sync_tools).toHaveLength(2);
    expect(sync_tools.map((t) => t.id).sort()).toEqual(["editor", "linter"]);

    const hover_tools = store.tools_with_capability("hover");
    expect(hover_tools).toHaveLength(1);
    expect(hover_tools[0]?.id).toBe("editor");

    const format_tools = store.tools_with_capability("formatting");
    expect(format_tools).toHaveLength(2);
    expect(format_tools.map((t) => t.id).sort()).toEqual([
      "linter",
      "static_tool",
    ]);
  });

  it("tools_with_capability returns empty for unmatched type", () => {
    const store = new ToolchainStore();
    store.set_tools([make_tool("a", { capabilities: [] })]);
    expect(store.tools_with_capability("diagnostics")).toHaveLength(0);
  });
});
