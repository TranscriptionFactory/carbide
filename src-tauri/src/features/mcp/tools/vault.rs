use std::collections::HashMap;

use serde_json::Value;
use tauri::AppHandle;

use crate::features::mcp::types::{InputSchema, ToolDefinition, ToolResult};
use crate::features::vault::service as vault_service;

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![list_vaults_def()]
}

pub fn dispatch(app: &AppHandle, name: &str, _arguments: Option<&Value>) -> Option<ToolResult> {
    match name {
        "list_vaults" => Some(handle_list_vaults(app)),
        _ => None,
    }
}

fn list_vaults_def() -> ToolDefinition {
    ToolDefinition {
        name: "list_vaults".into(),
        description: "List all registered vaults with their IDs, paths, and status.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties: HashMap::new(),
            required: vec![],
        },
    }
}

fn handle_list_vaults(app: &AppHandle) -> ToolResult {
    match vault_service::list_vaults(app.clone()) {
        Ok(vaults) => {
            if vaults.is_empty() {
                return ToolResult::text("No vaults registered.".into());
            }
            let lines: Vec<String> = vaults
                .iter()
                .map(|v| {
                    let available = if v.is_available {
                        "available"
                    } else {
                        "unavailable"
                    };
                    let notes = v
                        .note_count
                        .map(|c| format!(", {} notes", c))
                        .unwrap_or_default();
                    format!("{}\t{}\t{}\t[{}{}]", v.id, v.name, v.path, available, notes)
                })
                .collect();
            ToolResult::text(lines.join("\n"))
        }
        Err(e) => ToolResult::error(e),
    }
}
