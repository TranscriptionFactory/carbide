use serde::{Deserialize, Serialize};
use specta::Type;

pub struct PlatformBinary {
    pub triple: &'static str,
    pub asset_template: &'static str,
    pub sha256: &'static str,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ToolCapability {
    DocumentSync { debounce_ms: u64, skip_draft: bool },
    Diagnostics,
    Completion,
    Hover,
    References,
    Definition,
    Rename,
    Formatting,
    CodeActions,
    WorkspaceSymbols,
    InlayHints,
}

pub struct ToolSpec {
    pub id: &'static str,
    pub display_name: &'static str,
    pub github_repo: &'static str,
    pub version: &'static str,
    pub platform_binaries: &'static [PlatformBinary],
    pub binary_name: &'static str,
    pub default_args: &'static [&'static str],
    pub capabilities: &'static [ToolCapability],
}

impl ToolSpec {
    pub fn downloadable(&self) -> bool {
        !self.github_repo.is_empty()
            && self
                .platform_binaries
                .iter()
                .any(|p| p.asset_template != "")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ToolStatus {
    NotInstalled,
    Downloading { percent: f32 },
    Installed { version: String, path: String },
    Error { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ToolInfo {
    pub id: String,
    pub display_name: String,
    pub github_repo: String,
    pub version: String,
    pub status: ToolStatus,
    pub capabilities: Vec<ToolCapability>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ToolchainEvent {
    DownloadProgress {
        tool_id: String,
        percent: f32,
    },
    InstallComplete {
        tool_id: String,
        version: String,
        path: String,
    },
    InstallFailed {
        tool_id: String,
        message: String,
    },
}
