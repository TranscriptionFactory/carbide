use serde::Serialize;
use specta::Type;

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

#[derive(Debug, Serialize, Type)]
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
