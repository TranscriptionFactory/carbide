pub mod claude_adapter;

use super::agent_stream::{AgentEvent, AgentPermissionMode};

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
        permission_mode: &AgentPermissionMode,
        resume_session_id: Option<&str>,
    ) -> Vec<String>;

    fn new_parser(&self) -> Box<dyn HarnessEventParser>;
}
