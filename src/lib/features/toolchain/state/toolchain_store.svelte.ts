import type {
  ToolCapability,
  ToolInfo,
  ToolStatus,
} from "$lib/features/toolchain/types";

export class ToolchainStore {
  tools: Map<string, ToolInfo> = $state(new Map<string, ToolInfo>());

  set_tools(tools: ToolInfo[]) {
    const next = new Map<string, ToolInfo>();
    for (const tool of tools) {
      next.set(tool.id, tool);
    }
    this.tools = next;
  }

  update_status(tool_id: string, status: ToolStatus) {
    const tool = this.tools.get(tool_id);
    if (!tool) return;
    this.tools = new Map(this.tools).set(tool_id, { ...tool, status });
  }

  get_tool(tool_id: string): ToolInfo | undefined {
    return this.tools.get(tool_id);
  }

  tools_with_capability(cap: ToolCapability["type"]): ToolInfo[] {
    return [...this.tools.values()].filter((t) =>
      t.capabilities.some((c) => c.type === cap),
    );
  }
}
