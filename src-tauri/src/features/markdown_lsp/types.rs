use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum MarkdownLspProvider {
    Iwes,
    MarkdownOxide,
    Marksman,
}

impl MarkdownLspProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Iwes => "iwes",
            Self::MarkdownOxide => "markdown_oxide",
            Self::Marksman => "marksman",
        }
    }

    pub fn supports_inlay_hints(self) -> bool {
        matches!(self, Self::Iwes)
    }

    pub fn supports_formatting(self) -> bool {
        matches!(self, Self::Iwes)
    }

    pub fn supports_transform_actions(self) -> bool {
        matches!(self, Self::Iwes)
    }

    pub fn completion_trigger_characters(self) -> Vec<String> {
        match self {
            Self::Iwes => vec!["+".to_string(), "[".to_string(), "(".to_string()],
            Self::MarkdownOxide => vec![
                "[".to_string(),
                "(".to_string(),
                "#".to_string(),
                "^".to_string(),
            ],
            Self::Marksman => vec!["[".to_string(), "(".to_string(), "#".to_string()],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum MarkdownLspStatus {
    Starting,
    Running,
    Restarting { attempt: u32 },
    Stopped,
    Failed { message: String },
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MarkdownLspEvent {
    DiagnosticsUpdated {
        vault_id: String,
        uri: String,
        diagnostics: Vec<MarkdownLspDiagnostic>,
    },
    StatusChanged {
        vault_id: String,
        status: MarkdownLspStatus,
    },
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct MarkdownLspDiagnostic {
    pub line: u32,
    pub character: u32,
    pub end_line: u32,
    pub end_character: u32,
    pub severity: String,
    pub message: String,
}

#[derive(Debug, Serialize, Type)]
pub struct MarkdownLspHoverResult {
    pub contents: Option<String>,
}

#[derive(Debug, Serialize, Type)]
pub struct MarkdownLspRange {
    pub start_line: u32,
    pub start_character: u32,
    pub end_line: u32,
    pub end_character: u32,
}

#[derive(Debug, Serialize, Type)]
pub struct MarkdownLspLocation {
    pub uri: String,
    pub range: MarkdownLspRange,
}

#[derive(Debug, Serialize, Type)]
pub struct MarkdownLspCodeAction {
    pub title: String,
    pub kind: Option<String>,
    pub data: Option<String>,
    pub raw_json: String,
}

#[derive(Debug, Serialize, Type)]
pub struct MarkdownLspCompletionItem {
    pub label: String,
    pub detail: Option<String>,
    pub insert_text: Option<String>,
}

#[derive(Debug, Serialize, Type)]
pub struct MarkdownLspSymbol {
    pub name: String,
    pub kind: u32,
    pub location: MarkdownLspLocation,
}

#[derive(Debug, Serialize, Type)]
pub struct MarkdownLspDocumentSymbol {
    pub name: String,
    pub kind: u32,
    pub container_name: Option<String>,
    pub location: MarkdownLspLocation,
}

#[derive(Debug, Serialize, Type)]
pub struct MarkdownLspTextEdit {
    pub range: MarkdownLspRange,
    pub new_text: String,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct MarkdownLspWorkspaceEditResult {
    pub files_created: Vec<String>,
    pub files_deleted: Vec<String>,
    pub files_modified: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Type)]
pub struct MarkdownLspPrepareRenameResult {
    pub range: MarkdownLspRange,
    pub placeholder: String,
}

#[derive(Debug, Serialize, Type)]
pub struct MarkdownLspInlayHint {
    pub position_line: u32,
    pub position_character: u32,
    pub label: String,
}

#[derive(Debug, Serialize, Type)]
pub struct MarkdownLspStartResult {
    pub completion_trigger_characters: Vec<String>,
    pub effective_provider: MarkdownLspProvider,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct IweActionInfo {
    pub name: String,
    pub action_type: String,
    pub title: String,
}

#[derive(Debug, Serialize, Type)]
pub struct IweConfigStatus {
    pub exists: bool,
    pub config_url: String,
    pub config_path: String,
    pub action_count: usize,
    pub action_names: Vec<String>,
    pub actions: Vec<IweActionInfo>,
}
