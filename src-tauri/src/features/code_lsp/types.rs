use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CodeDiagnostic {
    pub line: u32,
    pub column: u32,
    pub end_line: u32,
    pub end_column: u32,
    pub severity: CodeDiagnosticSeverity,
    pub message: String,
    pub source: Option<String>,
    pub code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum CodeDiagnosticSeverity {
    Error,
    Warning,
    Info,
    Hint,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum CodeLspStatus {
    Running,
    Stopped,
    Starting,
    Unavailable { language: String },
    Error { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CodeLspHoverResult {
    pub contents: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CodeLspRange {
    pub start_line: u32,
    pub start_character: u32,
    pub end_line: u32,
    pub end_character: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CodeLspLocation {
    pub uri: String,
    pub range: CodeLspRange,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CodeLspCompletionItem {
    pub label: String,
    pub detail: Option<String>,
    pub insert_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CodeLspCodeAction {
    pub title: String,
    pub kind: Option<String>,
    pub data: Option<String>,
    pub raw_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CodeLspEvent {
    DiagnosticsUpdated {
        vault_id: String,
        language: String,
        path: String,
        diagnostics: Vec<CodeDiagnostic>,
    },
    ServerStatusChanged {
        vault_id: String,
        language: String,
        status: CodeLspStatus,
    },
}
