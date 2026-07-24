import type { RagCitation } from "$lib/features/rag/domain/rag_types";
import {
  MCP_TOOL_PREFIX,
  paths_from_summary,
  type AgentToolCall,
} from "$lib/features/rag/domain/agent_file_ops";

const CITATION_SOURCE_MCP_TOOLS = new Set(["read_note", "get_note_metadata"]);

const CITATION_SOURCE_BUILTIN_TOOLS = new Set(["Read"]);

export function is_citation_source_tool(name: string): boolean {
  if (name.startsWith(MCP_TOOL_PREFIX)) {
    return CITATION_SOURCE_MCP_TOOLS.has(name.slice(MCP_TOOL_PREFIX.length));
  }
  return CITATION_SOURCE_BUILTIN_TOOLS.has(name);
}

function title_from_path(note_path: string): string {
  const base = note_path.split("/").pop() ?? note_path;
  return base.replace(/\.md$/i, "");
}

export function citations_from_tools(calls: AgentToolCall[]): RagCitation[] {
  const seen = new Set<string>();
  const citations: RagCitation[] = [];
  for (const call of calls) {
    if (!is_citation_source_tool(call.name)) continue;
    for (const note_path of paths_from_summary(call.input_summary)) {
      if (seen.has(note_path)) continue;
      seen.add(note_path);
      citations.push({
        index: citations.length + 1,
        note_path,
        title: title_from_path(note_path),
      });
    }
  }
  return citations;
}
