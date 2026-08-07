use std::collections::HashSet;

use crate::features::mcp::types::ToolDefinition;

pub const MCP_TOOL_PREFIX: &str = "mcp__carbide__";

const MUTATING_BUILTIN_TOOLS: [&str; 4] = ["Write", "Edit", "MultiEdit", "NotebookEdit"];

/// Which tool names write to disk, so the frontend can refresh the vault even
/// when no path could be resolved from a call's input.
pub struct MutatingToolSet {
    mcp_names: HashSet<String>,
}

impl MutatingToolSet {
    pub fn from_catalog(catalog: &[ToolDefinition]) -> Self {
        Self {
            mcp_names: catalog
                .iter()
                .filter(|tool| tool.mutating)
                .map(|tool| format!("{MCP_TOOL_PREFIX}{}", tool.name))
                .collect(),
        }
    }

    pub fn contains(&self, name: &str) -> bool {
        MUTATING_BUILTIN_TOOLS.contains(&name) || self.mcp_names.contains(name)
    }
}

pub struct McpEndpoint {
    pub port: u16,
    pub token: String,
}
