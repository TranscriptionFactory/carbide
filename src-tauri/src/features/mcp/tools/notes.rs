use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::features::mcp::types::{InputSchema, PropertySchema, ToolDefinition, ToolResult};
use crate::features::notes::service::{
    self, file_meta, safe_vault_abs, safe_vault_abs_for_write, NoteCreateArgs, NoteDeleteArgs,
};
use crate::shared::io_utils;
use crate::shared::storage;

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![
        list_notes_def(),
        read_note_def(),
        create_note_def(),
        update_note_def(),
        delete_note_def(),
    ]
}

pub fn dispatch(app: &AppHandle, name: &str, arguments: Option<&Value>) -> Option<ToolResult> {
    match name {
        "list_notes" => Some(handle_list_notes(app, arguments)),
        "read_note" => Some(handle_read_note(app, arguments)),
        "create_note" => Some(handle_create_note(app, arguments)),
        "update_note" => Some(handle_update_note(app, arguments)),
        "delete_note" => Some(handle_delete_note(app, arguments)),
        _ => None,
    }
}

fn prop(prop_type: &str, description: &str) -> PropertySchema {
    PropertySchema {
        prop_type: prop_type.into(),
        description: Some(description.into()),
        enum_values: None,
        default: None,
    }
}

fn list_notes_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier"));
    properties.insert(
        "folder".into(),
        prop("string", "Filter to notes under this folder path"),
    );

    ToolDefinition {
        name: "list_notes".into(),
        description: "List all notes in a vault. Returns paths, titles, and metadata.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into()],
        },
    }
}

fn read_note_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier"));
    properties.insert(
        "path".into(),
        prop("string", "Vault-relative path to the note (e.g. folder/note.md)"),
    );

    ToolDefinition {
        name: "read_note".into(),
        description: "Read the full markdown content of a note.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into(), "path".into()],
        },
    }
}

fn create_note_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier"));
    properties.insert(
        "path".into(),
        prop("string", "Vault-relative path for the new note (must end in .md)"),
    );
    properties.insert("content".into(), prop("string", "Initial markdown content"));

    ToolDefinition {
        name: "create_note".into(),
        description: "Create a new note with the given path and content.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into(), "path".into(), "content".into()],
        },
    }
}

fn update_note_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier"));
    properties.insert(
        "path".into(),
        prop("string", "Vault-relative path to the note"),
    );
    properties.insert(
        "content".into(),
        prop("string", "New markdown content for the note"),
    );

    ToolDefinition {
        name: "update_note".into(),
        description: "Update the content of an existing note.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into(), "path".into(), "content".into()],
        },
    }
}

fn delete_note_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier"));
    properties.insert(
        "path".into(),
        prop("string", "Vault-relative path to the note to delete"),
    );

    ToolDefinition {
        name: "delete_note".into(),
        description: "Delete a note from the vault.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into(), "path".into()],
        },
    }
}

#[derive(Deserialize)]
struct ListNotesArgs {
    vault_id: String,
    #[serde(default)]
    folder: Option<String>,
}

fn handle_list_notes(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: ListNotesArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    match service::list_notes(app.clone(), args.vault_id) {
        Ok(mut notes) => {
            if let Some(folder) = &args.folder {
                let prefix = if folder.ends_with('/') {
                    folder.clone()
                } else {
                    format!("{}/", folder)
                };
                notes.retain(|n| n.path.starts_with(&prefix));
            }

            let lines: Vec<String> = notes
                .iter()
                .map(|n| format!("{}\t{}", n.path, n.title))
                .collect();
            ToolResult::text(lines.join("\n"))
        }
        Err(e) => ToolResult::error(e),
    }
}

#[derive(Deserialize)]
struct ReadNoteArgs {
    vault_id: String,
    path: String,
}

fn handle_read_note(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: ReadNoteArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    let root = match storage::vault_path(app, &args.vault_id) {
        Ok(r) => r,
        Err(e) => return ToolResult::error(e),
    };

    let abs = match safe_vault_abs(&root, &args.path) {
        Ok(a) => a,
        Err(e) => return ToolResult::error(e),
    };

    match std::fs::read_to_string(&abs) {
        Ok(content) => ToolResult::text(content),
        Err(e) => ToolResult::error(format!("Failed to read note: {}", e)),
    }
}

#[derive(Deserialize)]
struct CreateNoteArgs {
    vault_id: String,
    path: String,
    content: String,
}

fn handle_create_note(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: CreateNoteArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    match service::create_note(
        NoteCreateArgs {
            vault_id: args.vault_id,
            note_path: args.path,
            initial_markdown: args.content,
        },
        app.clone(),
    ) {
        Ok(meta) => ToolResult::text(format!("Created: {}", meta.path)),
        Err(e) => ToolResult::error(e),
    }
}

#[derive(Deserialize)]
struct UpdateNoteArgs {
    vault_id: String,
    path: String,
    content: String,
}

fn handle_update_note(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: UpdateNoteArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    let root = match storage::vault_path(app, &args.vault_id) {
        Ok(r) => r,
        Err(e) => return ToolResult::error(e),
    };

    let abs = match safe_vault_abs_for_write(&root, &args.path) {
        Ok(a) => a,
        Err(e) => return ToolResult::error(e),
    };

    if !abs.exists() {
        return ToolResult::error(format!("Note not found: {}", args.path));
    }

    match io_utils::atomic_write(&abs, args.content.as_bytes()) {
        Ok(()) => {
            let (mtime_ms, _, _) = file_meta(&abs).unwrap_or((0, 0, 0));
            ToolResult::text(format!("Updated: {} (mtime={})", args.path, mtime_ms))
        }
        Err(e) => ToolResult::error(format!("Failed to write note: {}", e)),
    }
}

#[derive(Deserialize)]
struct DeleteNoteArgs {
    vault_id: String,
    path: String,
}

fn handle_delete_note(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: DeleteNoteArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    match service::delete_note(
        NoteDeleteArgs {
            vault_id: args.vault_id.clone(),
            note_id: args.path.clone(),
        },
        app.clone(),
    ) {
        Ok(()) => ToolResult::text(format!("Deleted: {}", args.path)),
        Err(e) => ToolResult::error(e),
    }
}

pub fn parse_args<T: serde::de::DeserializeOwned>(arguments: Option<&Value>) -> Result<T, ToolResult> {
    let value = arguments.ok_or_else(|| ToolResult::error("Missing arguments".into()))?;
    serde_json::from_value(value.clone())
        .map_err(|e| ToolResult::error(format!("Invalid arguments: {}", e)))
}
