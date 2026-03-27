use serde::Serialize;
use specta::Type;

#[derive(Debug, Serialize, Type)]
pub struct MarksmanHoverResult {
    pub contents: Option<String>,
}

#[derive(Debug, Serialize, Type)]
pub struct MarksmanRange {
    pub start_line: u32,
    pub start_character: u32,
    pub end_line: u32,
    pub end_character: u32,
}

#[derive(Debug, Serialize, Type)]
pub struct MarksmanLocation {
    pub uri: String,
    pub range: MarksmanRange,
}

#[derive(Debug, Serialize, Type)]
pub struct MarksmanCodeAction {
    pub title: String,
    pub kind: Option<String>,
    pub data: Option<String>,
    pub raw_json: String,
}

#[derive(Debug, Serialize, Type)]
pub struct MarksmanCompletionItem {
    pub label: String,
    pub detail: Option<String>,
    pub insert_text: Option<String>,
}

#[derive(Debug, Serialize, Type)]
pub struct MarksmanSymbol {
    pub name: String,
    pub kind: u32,
    pub location: MarksmanLocation,
}

#[derive(Debug, Serialize, Type)]
pub struct MarksmanDocumentSymbol {
    pub name: String,
    pub kind: u32,
    pub container_name: Option<String>,
    pub location: MarksmanLocation,
}

#[derive(Debug, Serialize, Type)]
pub struct MarksmanTextEdit {
    pub range: MarksmanRange,
    pub new_text: String,
}

#[derive(Debug, Serialize, Type)]
pub struct MarksmanWorkspaceEditResult {
    pub files_created: Vec<String>,
    pub files_deleted: Vec<String>,
    pub files_modified: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Type)]
pub struct MarksmanPrepareRenameResult {
    pub range: MarksmanRange,
    pub placeholder: String,
}

#[derive(Debug, Serialize, Type)]
pub struct MarksmanInlayHint {
    pub position_line: u32,
    pub position_character: u32,
    pub label: String,
}

#[derive(Debug, Serialize, Type)]
pub struct MarksmanStartResult {
    pub completion_trigger_characters: Vec<String>,
}

#[derive(Debug, Serialize, Type)]
pub struct IweConfigStatus {
    pub exists: bool,
    pub config_url: String,
    pub action_count: usize,
    pub action_names: Vec<String>,
}
