use std::fmt;

#[derive(Debug, Clone)]
pub struct LspClientConfig {
    pub binary_path: String,
    pub args: Vec<String>,
    pub root_uri: String,
    pub capabilities: serde_json::Value,
    pub working_dir: Option<String>,
}

#[derive(Debug)]
pub enum LspClientError {
    ProcessSpawnFailed(String),
    ProcessExited,
    RequestTimeout,
    InvalidResponse(String),
    ShutdownFailed(String),
    ChannelClosed,
}

impl fmt::Display for LspClientError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LspClientError::ProcessSpawnFailed(e) => write!(f, "LSP process spawn failed: {}", e),
            LspClientError::ProcessExited => write!(f, "LSP process exited unexpectedly"),
            LspClientError::RequestTimeout => write!(f, "LSP request timed out"),
            LspClientError::InvalidResponse(e) => write!(f, "LSP invalid response: {}", e),
            LspClientError::ShutdownFailed(e) => write!(f, "LSP shutdown failed: {}", e),
            LspClientError::ChannelClosed => write!(f, "LSP client channel closed"),
        }
    }
}

impl std::error::Error for LspClientError {}
