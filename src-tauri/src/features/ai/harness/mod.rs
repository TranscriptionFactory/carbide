pub mod claude_adapter;

use super::agent_stream::{AgentEvent, ToolSelector};
use crate::features::mcp::types::ToolDefinition;

pub const MCP_TOOL_PREFIX: &str = "mcp__carbide__";

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

    fn spawn_args(
        &self,
        prompt: &str,
        mcp_config_path: &str,
        selector: &ToolSelector,
        catalog: &[ToolDefinition],
        resume_session_id: Option<&str>,
    ) -> Vec<String>;

    fn new_parser(&self) -> Box<dyn HarnessEventParser>;
}
