use std::collections::HashMap;

use serde_json::Value;
use tauri::AppHandle;

use crate::features::mcp::shared_ops::{self, CreateResult};
use crate::features::mcp::tools::{op_err_to_tool_result, parse_args, prop};
use crate::features::mcp::types::{InputSchema, PropertySchema, ToolDefinition, ToolResult};
use crate::features::notes::service::file_meta;

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

fn list_notes_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier"));
    properties.insert(
        "folder".into(),
        prop("string", "Filter to notes under this folder path"),
    );
    properties.insert(
        "limit".into(),
        PropertySchema {
            prop_type: "integer".into(),
            description: Some("Maximum number of results (default: 200)".into()),
            enum_values: None,
            default: Some(Value::Number(200.into())),
        },
    );
    properties.insert(
        "offset".into(),
        PropertySchema {
            prop_type: "integer".into(),
            description: Some("Offset for pagination (default: 0)".into()),
            enum_values: None,
            default: Some(Value::Number(0.into())),
        },
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
        prop(
            "string",
            "Vault-relative path to the note (e.g. folder/note.md)",
        ),
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
        prop(
            "string",
            "Vault-relative path for the new note (must end in .md)",
        ),
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

fn handle_list_notes(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: shared_ops::ListNotesArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    let limit = args.limit.unwrap_or(200).min(500);
    let offset = args.offset.unwrap_or(0);

    match shared_ops::list_notes(app, &args.vault_id, args.folder.as_deref(), limit, offset) {
        Ok(paginated) => {
            let lines: Vec<String> = paginated
                .items
                .iter()
                .map(|n| format!("{}\t{}", n.path, n.title))
                .collect();
            let end = (offset + paginated.items.len()).min(paginated.total);
            let mut output = lines.join("\n");
            output.push_str(&format!(
                "\n(showing {}-{} of {})",
                if paginated.items.is_empty() {
                    0
                } else {
                    offset + 1
                },
                end,
                paginated.total
            ));
            ToolResult::text(output)
        }
        Err(e) => op_err_to_tool_result(e),
    }
}

fn handle_read_note(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: shared_ops::VaultPathArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    match shared_ops::read_note(app, &args.vault_id, &args.path) {
        Ok((_, content)) => ToolResult::text(content),
        Err(e) => op_err_to_tool_result(e),
    }
}

fn handle_create_note(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: shared_ops::CreateNoteArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    match shared_ops::create_note(app, &args) {
        Ok(CreateResult::Created(meta)) => ToolResult::text(format!("Created: {}", meta.path)),
        Ok(CreateResult::Overwritten(path)) => ToolResult::text(format!("Overwritten: {}", path)),
        Err(e) => op_err_to_tool_result(e),
    }
}

fn handle_update_note(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: shared_ops::WriteNoteArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    match shared_ops::write_note(app, &args.vault_id, &args.path, &args.content) {
        Ok(path) => {
            let root = crate::shared::storage::vault_path(app, &args.vault_id);
            let mtime = root
                .ok()
                .and_then(|r| crate::features::notes::service::safe_vault_abs(&r, &path).ok())
                .and_then(|abs| file_meta(&abs).ok())
                .map(|(m, _, _)| m)
                .unwrap_or(0);
            ToolResult::text(format!("Updated: {} (mtime={})", path, mtime))
        }
        Err(e) => op_err_to_tool_result(e),
    }
}

fn handle_delete_note(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: shared_ops::VaultPathArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    match shared_ops::delete_note(app, &args.vault_id, &args.path) {
        Ok(()) => ToolResult::text(format!("Deleted: {}", args.path)),
        Err(e) => op_err_to_tool_result(e),
    }
}
