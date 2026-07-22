use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::features::mcp::shared_ops::{self, CreateResult, VAULT_ID_OPTIONAL_DESC};
use crate::features::mcp::tools::{op_err_to_tool_result, parse_args, prop};
use crate::features::mcp::types::{InputSchema, PropertySchema, ToolDefinition, ToolResult};
use crate::features::notes::service::file_meta;

#[derive(Default, Serialize, Deserialize)]
pub(crate) struct NoteContentArgs {
    #[serde(default)]
    pub vault_id: Option<String>,
    pub path: String,
    pub content: String,
}

#[derive(Default, Serialize, Deserialize)]
pub(crate) struct EditNoteArgs {
    #[serde(default)]
    pub vault_id: Option<String>,
    pub path: String,
    pub old_string: String,
    pub new_string: String,
    #[serde(default)]
    pub replace_all: bool,
}

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![
        list_notes_def(),
        read_note_def(),
        create_note_def(),
        update_note_def(),
        edit_note_def(),
        delete_note_def(),
        append_note_def(),
        prepend_note_def(),
        ensure_frontmatter_def(),
    ]
}

pub fn dispatch(app: &AppHandle, name: &str, arguments: Option<&Value>) -> Option<ToolResult> {
    match name {
        "list_notes" => Some(handle_list_notes(app, arguments)),
        "read_note" => Some(handle_read_note(app, arguments)),
        "create_note" => Some(handle_create_note(app, arguments)),
        "update_note" => Some(handle_update_note(app, arguments)),
        "edit_note" => Some(handle_edit_note(app, arguments)),
        "delete_note" => Some(handle_delete_note(app, arguments)),
        "append_note" => Some(handle_append_note(app, arguments)),
        "prepend_note" => Some(handle_prepend_note(app, arguments)),
        "ensure_frontmatter" => Some(handle_ensure_frontmatter(app, arguments)),
        _ => None,
    }
}

fn list_notes_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier (use list_vaults to discover IDs)"));
    properties.insert(
        "folder".into(),
        prop("string", "Optional. Vault-relative folder path to filter by (e.g. 'projects/active'). Omit to list all notes."),
    );
    properties.insert(
        "limit".into(),
        PropertySchema {
            prop_type: "integer".into(),
            description: Some("Optional. Maximum number of results to return (default: 200, max: 500)".into()),
            enum_values: None,
            default: Some(Value::Number(200.into())),
        },
    );
    properties.insert(
        "offset".into(),
        PropertySchema {
            prop_type: "integer".into(),
            description: Some("Optional. Number of results to skip for pagination (default: 0)".into()),
            enum_values: None,
            default: Some(Value::Number(0.into())),
        },
    );

    ToolDefinition {
        name: "list_notes".into(),
        mutating: false,
        description: "List notes in a vault with pagination. Returns tab-separated lines of path and title, plus a count summary. Use folder to filter by directory. Use search_notes for full-text search, or query_notes_by_property to filter by frontmatter fields.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into()],
        },
    }
}

fn read_note_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier (use list_vaults to discover IDs)"));
    properties.insert(
        "path".into(),
        prop(
            "string",
            "Vault-relative path to the note (e.g. 'folder/note.md')",
        ),
    );

    ToolDefinition {
        name: "read_note".into(),
        mutating: false,
        description: "Read the full markdown content of a note, including frontmatter. Returns raw markdown as a single text block. Use get_note_metadata instead if you only need title, tags, properties, or stats.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into(), "path".into()],
        },
    }
}

fn create_note_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier (use list_vaults to discover IDs)"));
    properties.insert(
        "path".into(),
        prop(
            "string",
            "Vault-relative path for the new note. Must end in .md (e.g. 'projects/new-idea.md'). Parent directories are created automatically.",
        ),
    );
    properties.insert("content".into(), prop("string", "Initial markdown content (including any frontmatter)"));
    properties.insert(
        "overwrite".into(),
        PropertySchema {
            prop_type: "boolean".into(),
            description: Some("Optional. If true, replace the note when one already exists at the path instead of failing (default: false).".into()),
            enum_values: None,
            default: Some(Value::Bool(false)),
        },
    );

    ToolDefinition {
        name: "create_note".into(),
        mutating: true,
        description: "Create a new note. Fails with a conflict error if a note already exists at the given path, unless overwrite is true. Use update_note or edit_note to modify existing notes. Returns the created (or overwritten) path on success.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into(), "path".into(), "content".into()],
        },
    }
}

fn update_note_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier (use list_vaults to discover IDs)"));
    properties.insert(
        "path".into(),
        prop("string", "Vault-relative path to the note (e.g. 'folder/note.md')"),
    );
    properties.insert(
        "content".into(),
        prop("string", "New markdown content (replaces entire file, including frontmatter)"),
    );

    ToolDefinition {
        name: "update_note".into(),
        mutating: true,
        description: "Replace the full content of an existing note. Fails if the note does not exist — use create_note for new notes. Returns the updated path and modification timestamp.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into(), "path".into(), "content".into()],
        },
    }
}

fn edit_note_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", VAULT_ID_OPTIONAL_DESC));
    properties.insert(
        "path".into(),
        prop("string", "Vault-relative path to the note (e.g. 'folder/note.md')"),
    );
    properties.insert(
        "old_string".into(),
        prop("string", "The exact text to replace. Must match a unique occurrence in the note unless replace_all is true."),
    );
    properties.insert(
        "new_string".into(),
        prop("string", "The text to replace old_string with. Must differ from old_string."),
    );
    properties.insert(
        "replace_all".into(),
        PropertySchema {
            prop_type: "boolean".into(),
            description: Some("Optional. Replace every occurrence of old_string instead of requiring a unique match (default: false).".into()),
            enum_values: None,
            default: Some(Value::Bool(false)),
        },
    );

    ToolDefinition {
        name: "edit_note".into(),
        mutating: true,
        description: "Make a targeted edit to an existing note by replacing old_string with new_string. Fails if old_string is not found, or if it matches more than once and replace_all is not set. Prefer this over update_note when changing part of a note. Returns the path and number of replacements.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["path".into(), "old_string".into(), "new_string".into()],
        },
    }
}

fn delete_note_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier (use list_vaults to discover IDs)"));
    properties.insert(
        "path".into(),
        prop("string", "Vault-relative path to the note to delete (e.g. 'folder/note.md')"),
    );

    ToolDefinition {
        name: "delete_note".into(),
        mutating: true,
        description: "Permanently delete a note from the vault. Fails if the note does not exist. Returns the deleted path on success.".into(),
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

fn handle_edit_note(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: EditNoteArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    let vault_id = match shared_ops::resolve_vault_id(app, args.vault_id) {
        Ok(v) => v,
        Err(e) => return op_err_to_tool_result(e),
    };

    match shared_ops::edit_note(
        app,
        &vault_id,
        &args.path,
        &args.old_string,
        &args.new_string,
        args.replace_all,
    ) {
        Ok((path, replacements)) => {
            ToolResult::text(format!("Edited: {} ({} replacement(s))", path, replacements))
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

fn append_note_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", VAULT_ID_OPTIONAL_DESC));
    properties.insert(
        "path".into(),
        prop("string", "Vault-relative path of the note to append to"),
    );
    properties.insert(
        "content".into(),
        prop("string", "Content to append at the end of the note"),
    );

    ToolDefinition {
        name: "append_note".into(),
        mutating: true,
        description: "Append content to the end of an existing note. Use this to add new sections, paragraphs, or entries without overwriting existing content.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["path".into(), "content".into()],
        },
    }
}

fn prepend_note_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", VAULT_ID_OPTIONAL_DESC));
    properties.insert(
        "path".into(),
        prop("string", "Vault-relative path of the note to prepend to"),
    );
    properties.insert(
        "content".into(),
        prop("string", "Content to insert after frontmatter (or at the start if no frontmatter)"),
    );

    ToolDefinition {
        name: "prepend_note".into(),
        mutating: true,
        description: "Insert content at the beginning of a note, after any YAML frontmatter. Use this to add content to the top of a note without disturbing metadata.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["path".into(), "content".into()],
        },
    }
}

fn handle_append_note(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: NoteContentArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    let vault_id = match shared_ops::resolve_vault_id(app, args.vault_id) {
        Ok(v) => v,
        Err(e) => return op_err_to_tool_result(e),
    };

    match shared_ops::append_to_note(app, &vault_id, &args.path, &args.content) {
        Ok(path) => ToolResult::text(format!("Appended to: {}", path)),
        Err(e) => op_err_to_tool_result(e),
    }
}

fn handle_prepend_note(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: NoteContentArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    let vault_id = match shared_ops::resolve_vault_id(app, args.vault_id) {
        Ok(v) => v,
        Err(e) => return op_err_to_tool_result(e),
    };

    match shared_ops::prepend_to_note(app, &vault_id, &args.path, &args.content) {
        Ok(path) => ToolResult::text(format!("Prepended to: {}", path)),
        Err(e) => op_err_to_tool_result(e),
    }
}

fn ensure_frontmatter_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert(
        "vault_id".into(),
        prop("string", "Vault identifier (use list_vaults to discover IDs)"),
    );
    properties.insert(
        "path".into(),
        prop("string", "Vault-relative path of the note to ensure frontmatter for"),
    );

    ToolDefinition {
        name: "ensure_frontmatter".into(),
        mutating: true,
        description: "Add title and date_created frontmatter to a note if it doesn't already have any. Idempotent: no-op if frontmatter exists.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into(), "path".into()],
        },
    }
}

fn handle_ensure_frontmatter(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: shared_ops::VaultPathArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    match shared_ops::ensure_frontmatter(app, &args.vault_id, &args.path) {
        Ok(path) => ToolResult::text(format!("Frontmatter ensured: {}", path)),
        Err(e) => op_err_to_tool_result(e),
    }
}
