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
