use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::features::git::service as git_service;
use crate::features::mcp::tools::notes::parse_args;
use crate::features::mcp::types::{InputSchema, PropertySchema, ToolDefinition, ToolResult};
use crate::features::notes::service::{self as notes_service, NoteRenameArgs};
use crate::shared::storage;

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![git_status_def(), git_log_def(), rename_note_def()]
}

pub fn dispatch(app: &AppHandle, name: &str, arguments: Option<&Value>) -> Option<ToolResult> {
    match name {
        "git_status" => Some(handle_git_status(app, arguments)),
        "git_log" => Some(handle_git_log(app, arguments)),
        "rename_note" => Some(handle_rename_note(app, arguments)),
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

fn git_status_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier"));

    ToolDefinition {
        name: "git_status".into(),
        description: "Get the git working tree status for a vault (branch, modified/staged/untracked files).".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into()],
        },
    }
}

fn git_log_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier"));
    properties.insert(
        "limit".into(),
        PropertySchema {
            prop_type: "integer".into(),
            description: Some("Maximum number of commits to return (default: 20)".into()),
            enum_values: None,
            default: Some(Value::Number(20.into())),
        },
    );

    ToolDefinition {
        name: "git_log".into(),
        description: "Get recent git commit history for a vault.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into()],
        },
    }
}

fn rename_note_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier"));
    properties.insert(
        "old_path".into(),
        prop(
            "string",
            "Current vault-relative path of the note (e.g. folder/note.md)",
        ),
    );
    properties.insert(
        "new_path".into(),
        prop(
            "string",
            "New vault-relative path for the note (e.g. other/renamed.md)",
        ),
    );

    ToolDefinition {
        name: "rename_note".into(),
        description: "Rename or move a note to a new path within the vault.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into(), "old_path".into(), "new_path".into()],
        },
    }
}

#[derive(Deserialize)]
struct VaultArgs {
    vault_id: String,
}

#[derive(Deserialize)]
struct GitLogArgs {
    vault_id: String,
    #[serde(default)]
    limit: Option<usize>,
}

#[derive(Deserialize)]
struct RenameNoteArgs {
    vault_id: String,
    old_path: String,
    new_path: String,
}

fn vault_path_string(app: &AppHandle, vault_id: &str) -> Result<String, ToolResult> {
    storage::vault_path(app, vault_id)
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(ToolResult::error)
}

fn handle_git_status(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: VaultArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    let vault_path = match vault_path_string(app, &args.vault_id) {
        Ok(p) => p,
        Err(e) => return e,
    };

    match git_service::git_status(vault_path) {
        Ok(status) => {
            let mut lines = vec![format!("Branch: {}", status.branch)];
            if status.is_dirty {
                lines.push(format!("{} changed file(s)", status.files.len()));
            } else {
                lines.push("Clean working tree".into());
            }
            if status.has_upstream {
                if status.ahead > 0 {
                    lines.push(format!("Ahead: {}", status.ahead));
                }
                if status.behind > 0 {
                    lines.push(format!("Behind: {}", status.behind));
                }
            }
            for f in &status.files {
                lines.push(format!("  {} {}", f.status, f.path));
            }
            ToolResult::text(lines.join("\n"))
        }
        Err(e) => ToolResult::error(e),
    }
}

fn handle_git_log(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: GitLogArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    let vault_path = match vault_path_string(app, &args.vault_id) {
        Ok(p) => p,
        Err(e) => return e,
    };

    let limit = args.limit.unwrap_or(20).min(100);

    match git_service::collect_git_log(&vault_path, None, limit) {
        Ok(commits) => {
            if commits.is_empty() {
                return ToolResult::text("No commits found.".into());
            }
            let lines: Vec<String> = commits
                .iter()
                .map(|c| format!("{} {} {}", c.short_hash, c.author, c.message.trim()))
                .collect();
            ToolResult::text(lines.join("\n"))
        }
        Err(e) => ToolResult::error(e),
    }
}

fn handle_rename_note(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: RenameNoteArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    match notes_service::rename_note(
        NoteRenameArgs {
            vault_id: args.vault_id,
            from: args.old_path.clone(),
            to: args.new_path.clone(),
        },
        app.clone(),
    ) {
        Ok(()) => ToolResult::text(format!("Renamed: {} → {}", args.old_path, args.new_path)),
        Err(e) => ToolResult::error(e),
    }
}
