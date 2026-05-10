use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ExternalMcpStatus {
    Stopped,
    Starting,
    Running { tool_count: usize },
    Error { message: String },
}

#[derive(Debug, Clone)]
pub struct ExternalMcpConfig {
    pub binary: String,
    pub args: Vec<String>,
    pub env_vars: Vec<(String, String)>,
    pub working_dir: Option<String>,
    pub request_timeout_ms: u64,
    pub init_timeout_ms: u64,
}

#[derive(Debug)]
pub enum ExternalMcpError {
    ProcessSpawnFailed(String),
    InitTimeout,
    InitFailed(String),
    ProcessExited,
    RequestTimeout,
    InvalidResponse(String),
    ChannelClosed,
    ServerNotFound(String),
    AlreadyRunning(String),
}

impl std::fmt::Display for ExternalMcpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ProcessSpawnFailed(e) => write!(f, "Process spawn failed: {}", e),
            Self::InitTimeout => write!(f, "MCP initialization timed out"),
            Self::InitFailed(e) => write!(f, "MCP initialization failed: {}", e),
            Self::ProcessExited => write!(f, "MCP process exited unexpectedly"),
            Self::RequestTimeout => write!(f, "MCP request timed out"),
            Self::InvalidResponse(e) => write!(f, "Invalid MCP response: {}", e),
            Self::ChannelClosed => write!(f, "MCP client channel closed"),
            Self::ServerNotFound(id) => write!(f, "MCP server not found: {}", id),
            Self::AlreadyRunning(id) => write!(f, "MCP server already running: {}", id),
        }
    }
}

impl std::error::Error for ExternalMcpError {}
