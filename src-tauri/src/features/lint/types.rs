use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct LintDiagnostic {
    pub line: u32,
    pub column: u32,
    pub end_line: u32,
    pub end_column: u32,
    pub severity: LintSeverity,
    pub message: String,
    pub rule_id: Option<String>,
    pub fixable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum LintSeverity {
    Error,
    Warning,
    Info,
    Hint,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileDiagnostics {
    pub path: String,
    pub diagnostics: Vec<LintDiagnostic>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct LintTextEdit {
    pub start_line: u32,
    pub start_column: u32,
    pub end_line: u32,
    pub end_column: u32,
    pub new_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum LintStatus {
    Running,
    Stopped,
    Error { message: String },
    Starting,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum LintEvent {
    DiagnosticsUpdated {
        vault_id: String,
        path: String,
        diagnostics: Vec<LintDiagnostic>,
    },
    StatusChanged {
        vault_id: String,
        status: LintStatus,
    },
}
