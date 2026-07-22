use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::features::git::service as git_service;
use crate::features::mcp::shared_ops;
use crate::features::mcp::tools::{op_err_to_tool_result, parse_args, prop};
use crate::features::mcp::types::{InputSchema, PropertySchema, ToolDefinition, ToolResult};
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

fn git_status_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier (use list_vaults to discover IDs)"));

    ToolDefinition {
        name: "git_status".into(),
        mutating: false,
        description:
            "Get the git working tree status for a vault. Returns branch name, clean/dirty state, ahead/behind counts, and per-file status codes with paths. Only works if the vault is a git repository."
                .into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into()],
        },
    }
}

fn git_log_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier (use list_vaults to discover IDs)"));
    properties.insert(
        "limit".into(),
        PropertySchema {
            prop_type: "integer".into(),
            description: Some("Optional. Maximum number of commits to return (default: 20, max: 100)".into()),
            enum_values: None,
            default: Some(Value::Number(20.into())),
        },
    );

    ToolDefinition {
        name: "git_log".into(),
        mutating: false,
        description: "Get recent git commit history for a vault. Returns one line per commit: short_hash, author, and message. Only works if the vault is a git repository.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into()],
        },
    }
}

fn rename_note_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier (optional if an active vault is set)"));
    properties.insert(
        "old_path".into(),
        prop(
            "string",
            "Current vault-relative path of the note (e.g. 'folder/note.md')",
        ),
    );
    properties.insert(
        "new_path".into(),
        prop(
            "string",
            "New vault-relative path for the note (e.g. 'other/renamed.md'). Must end in .md.",
        ),
    );

    ToolDefinition {
        name: "rename_note".into(),
        mutating: true,
        description: "Rename or move a note within the vault. **Automatically updates all wikilinks** (`[[...]]`) in other notes that reference the old path. Returns the old and new paths plus a count of updated backlinks.".into(),
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

    match shared_ops::rename_note_and_update_links(
        app,
        &args.vault_id,
        &args.old_path,
        &args.new_path,
    ) {
        Ok((renamed, updated_count)) => {
            if updated_count > 0 {
                ToolResult::text(format!(
                    "Renamed: {}. Updated wikilinks in {} note(s).",
                    renamed, updated_count
                ))
            } else {
                ToolResult::text(format!("Renamed: {}", renamed))
            }
        }
        Err(e) => op_err_to_tool_result(e),
    }
}
