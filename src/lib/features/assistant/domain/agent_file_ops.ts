export type AgentToolCall = {
  name: string;
  input_summary: string;
  paths?: string[];
  mutating?: boolean;
};

export const MCP_TOOL_PREFIX = "mcp__carbide__";

const MUTATING_MCP_TOOLS = new Set([
  "create_note",
  "update_note",
  "edit_note",
  "delete_note",
  "append_note",
  "prepend_note",
  "ensure_frontmatter",
  "rename_note",
  "reindex",
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

export function is_mutating_call(call: AgentToolCall): boolean {
  return call.mutating ?? is_mutating_tool(call.name);
}

// Kept in lockstep with PATH_KEYS in src-tauri/src/features/ai/tool_paths.rs;
// src-tauri/tests/mcp_mutating_parity.rs fails if the two lists diverge.
const PATH_KEYS = [
  "file_path",
  "path",
  "old_path",
  "new_path",
  "notebook_path",
];

// input_summary is the tool input serialized as JSON, truncated to ~200 chars
// (contract with the Rust event normalizer); truncation can break the JSON.
// Only a fallback: harness events carry the paths structurally.
export function paths_from_summary(summary: string): string[] {
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

export function paths_from_call(call: AgentToolCall): string[] {
  if (call.paths && call.paths.length > 0) return call.paths;
  return paths_from_summary(call.input_summary);
}

// Harness CLIs run with the vault as cwd and report absolute paths, while the
// MCP tools report vault-relative ones. Everything downstream keys on relative.
export function to_vault_relative_path(
  vault_path: string,
  path: string,
): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  const root = vault_path.replace(/\\/g, "/").replace(/\/+$/, "");
  if (root === "") return normalized;
  const prefix = `${root}/`;
  return normalized.toLowerCase().startsWith(prefix.toLowerCase())
    ? normalized.slice(prefix.length)
    : normalized;
}

export function changed_files_from_tools(
  calls: AgentToolCall[],
  vault_path: string,
): string[] {
  const paths: string[] = [];
  for (const call of calls) {
    if (!is_mutating_call(call)) continue;
    for (const path of paths_from_call(call)) {
      const relative = to_vault_relative_path(vault_path, path);
      if (relative !== "" && !paths.includes(relative)) paths.push(relative);
    }
  }
  return paths;
}
