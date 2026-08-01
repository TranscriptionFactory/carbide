pub mod claude_adapter;
pub mod codex_adapter;

use std::collections::HashSet;

use super::agent_stream::{AgentEvent, ToolSelector};
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

pub struct AgentInvocation {
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
}

pub fn mcp_allow_list(catalog: &[ToolDefinition]) -> Vec<String> {
    catalog
        .iter()
        .filter(|tool| !tool.mutating)
        .map(|tool| format!("{MCP_TOOL_PREFIX}{}", tool.name))
        .collect()
}

pub fn selector_allow_list(
    selector: &ToolSelector,
    catalog: &[ToolDefinition],
) -> Option<Vec<String>> {
    match selector {
        ToolSelector::Full => None,
        ToolSelector::ReadOnly => Some(mcp_allow_list(catalog)),
        ToolSelector::Only { names } => Some(
            names
                .iter()
                .map(|name| format!("{MCP_TOOL_PREFIX}{name}"))
                .collect(),
        ),
    }
}

pub trait HarnessEventParser: Send {
    fn parse_line(&mut self, line: &str) -> Vec<AgentEvent>;
    fn saw_result(&self) -> bool;
}

pub trait HarnessAdapter {
    const SUPPORTS_RESUME: bool;
    const SUPPORTS_PARTIAL_TEXT: bool;

    fn build_invocation(
        &self,
        prompt: &str,
        endpoint: &McpEndpoint,
        selector: &ToolSelector,
        catalog: &[ToolDefinition],
        resume_session_id: Option<&str>,
    ) -> Result<AgentInvocation, String>;

    fn new_parser(&self, catalog: &[ToolDefinition]) -> Box<dyn HarnessEventParser>;
}
