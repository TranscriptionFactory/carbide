export type AgentToolCall = {
  name: string;
  input_summary: string;
};

const MCP_TOOL_PREFIX = "mcp__carbide__";

const MUTATING_MCP_TOOLS = new Set([
  "create_note",
  "update_note",
  "delete_note",
  "append_note",
  "prepend_note",
  "ensure_frontmatter",
  "rename_note",
]);

const MUTATING_BUILTIN_TOOLS = new Set([
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
]);

export function is_mutating_tool(name: string): boolean {
  if (name.startsWith(MCP_TOOL_PREFIX)) {
    return MUTATING_MCP_TOOLS.has(name.slice(MCP_TOOL_PREFIX.length));
  }
  return MUTATING_BUILTIN_TOOLS.has(name);
}

const PATH_KEYS = ["file_path", "path", "old_path", "new_path"];

// input_summary is the tool input serialized as JSON, truncated to ~200 chars
// (contract with the Rust event normalizer); truncation can break the JSON.
function paths_from_summary(summary: string): string[] {
  const trimmed = summary.trim();
  if (trimmed === "") return [];
  if (!trimmed.startsWith("{")) return [trimmed];
  try {
    const input = JSON.parse(trimmed) as Record<string, unknown>;
    return PATH_KEYS.map((key) => input[key]).filter(
      (value): value is string => typeof value === "string" && value !== "",
    );
  } catch {
    return [];
  }
}

export function changed_files_from_tools(calls: AgentToolCall[]): string[] {
  const paths: string[] = [];
  for (const call of calls) {
    if (!is_mutating_tool(call.name)) continue;
    for (const path of paths_from_summary(call.input_summary)) {
      if (!paths.includes(path)) paths.push(path);
    }
  }
  return paths;
}
