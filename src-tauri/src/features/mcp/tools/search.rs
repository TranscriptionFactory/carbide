use std::collections::HashMap;

use serde_json::Value;
use tauri::AppHandle;

use crate::features::mcp::shared_ops::{self, OpError};
use crate::features::mcp::tools::parse_args;
use crate::features::mcp::types::{InputSchema, PropertySchema, ToolDefinition, ToolResult};

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![search_notes_def()]
}

pub fn dispatch(app: &AppHandle, name: &str, arguments: Option<&Value>) -> Option<ToolResult> {
    match name {
        "search_notes" => Some(handle_search_notes(app, arguments)),
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

fn search_notes_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier"));
    properties.insert("query".into(), prop("string", "Search query text"));
    properties.insert(
        "limit".into(),
        PropertySchema {
            prop_type: "integer".into(),
            description: Some("Maximum number of results (default: 20)".into()),
            enum_values: None,
            default: Some(Value::Number(20.into())),
        },
    );

    ToolDefinition {
        name: "search_notes".into(),
        description: "Search notes using full-text search. Returns matching notes with relevance scores and text snippets.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into(), "query".into()],
        },
    }
}

fn op_err_to_tool_result(e: OpError) -> ToolResult {
    match e {
        OpError::NotFound(m)
        | OpError::BadRequest(m)
        | OpError::Conflict(m)
        | OpError::Internal(m) => ToolResult::error(m),
    }
}

fn handle_search_notes(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: shared_ops::SearchArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    let max = args.limit.unwrap_or(20).min(100);

    match shared_ops::search_notes_index(app, &args.vault_id, &args.query, max) {
        Ok(hits) => {
            if hits.is_empty() {
                return ToolResult::text("No results found.".into());
            }
            let lines: Vec<String> = hits
                .iter()
                .map(|hit| {
                    let snippet = hit
                        .snippet
                        .as_deref()
                        .map(|s| format!("\n  {}", s))
                        .unwrap_or_default();
                    format!(
                        "{}\t{}\t{:.2}{}",
                        hit.note.path, hit.note.title, hit.score, snippet
                    )
                })
                .collect();
            ToolResult::text(lines.join("\n"))
        }
        Err(e) => op_err_to_tool_result(e),
    }
}
