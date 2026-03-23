use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Serialize, Type)]
pub struct IweHoverResult {
    pub contents: Option<String>,
}

#[derive(Debug, Serialize, Type)]
pub struct IweRange {
    pub start_line: u32,
    pub start_character: u32,
    pub end_line: u32,
    pub end_character: u32,
}

#[derive(Debug, Serialize, Type)]
pub struct IweLocation {
    pub uri: String,
    pub range: IweRange,
}

#[derive(Debug, Serialize, Type)]
pub struct IweCodeAction {
    pub title: String,
    pub kind: Option<String>,
    pub data: Option<String>,
}

#[derive(Debug, Serialize, Type)]
pub struct IweCompletionItem {
    pub label: String,
    pub detail: Option<String>,
    pub insert_text: Option<String>,
}

#[derive(Debug, Serialize, Type)]
pub struct IweSymbol {
    pub name: String,
    pub kind: u32,
    pub location: IweLocation,
}

#[derive(Debug, Serialize, Type)]
pub struct IweDocumentSymbol {
    pub name: String,
    pub kind: u32,
    pub container_name: Option<String>,
    pub location: IweLocation,
}

#[derive(Debug, Serialize, Type)]
pub struct IweTextEdit {
    pub range: IweRange,
    pub new_text: String,
}

#[derive(Debug, Serialize, Type)]
pub struct IweWorkspaceEditResult {
    pub files_created: Vec<String>,
    pub files_deleted: Vec<String>,
    pub files_modified: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Type)]
pub struct IwePrepareRenameResult {
    pub range: IweRange,
    pub placeholder: String,
}

#[derive(Debug, Serialize, Type)]
pub struct IweInlayHint {
    pub position_line: u32,
    pub position_character: u32,
    pub label: String,
}

#[derive(Debug, Serialize, Type)]
pub struct IweStartResult {
    pub completion_trigger_characters: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct IweTreeNode {
    pub name: String,
    pub key: String,
    pub children: Vec<IweTreeNode>,
}
