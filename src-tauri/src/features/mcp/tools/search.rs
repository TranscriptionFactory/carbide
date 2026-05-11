use std::collections::HashMap;

use serde_json::Value;
use tauri::AppHandle;

use crate::features::mcp::shared_ops::{self};
use crate::features::mcp::tools::{op_err_to_tool_result, parse_args, prop};
use crate::features::mcp::types::{InputSchema, PropertySchema, ToolDefinition, ToolResult};

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![search_notes_def(), reindex_def()]
}

pub fn dispatch(app: &AppHandle, name: &str, arguments: Option<&Value>) -> Option<ToolResult> {
    match name {
        "search_notes" => Some(handle_search_notes(app, arguments)),
        "reindex" => Some(handle_reindex(app, arguments)),
        _ => None,
    }
}

fn search_notes_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier (optional if an active vault is set)"));
    properties.insert("query".into(), prop("string", "Search query text. Searches note titles and body content."));
    properties.insert(
        "limit".into(),
        PropertySchema {
            prop_type: "integer".into(),
            description: Some("Optional. Maximum number of results to return (default: 20, max: 100)".into()),
            enum_values: None,
            default: Some(Value::Number(20.into())),
        },
    );
    properties.insert(
        "mode".into(),
        PropertySchema {
            prop_type: "string".into(),
            description: Some("Search mode: 'text' (default, full-text search) or 'semantic' (hybrid vector + FTS search, better for conceptual queries)".into()),
            enum_values: Some(vec!["text".into(), "semantic".into()]),
            default: Some(Value::String("text".into())),
        },
    );

    ToolDefinition {
        name: "search_notes".into(),
        description: "Search across note titles and content. Supports full-text search (default) and semantic/hybrid search for conceptual queries. Returns tab-separated lines of path, title, and relevance score, with matching text snippets on the next line.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into(), "query".into()],
        },
    }
}

fn reindex_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier (use list_vaults to discover IDs)"));

    ToolDefinition {
        name: "reindex".into(),
        description: "Rebuild the search index for a vault. Triggers a full re-index of all notes in the background. Use this if search results seem stale or incomplete. Returns immediately; indexing continues asynchronously.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into()],
        },
    }
}

fn handle_reindex(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: shared_ops::VaultIdArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    match shared_ops::reindex(app, &args.vault_id) {
        Ok(()) => ToolResult::text("Reindex started.".into()),
        Err(e) => op_err_to_tool_result(e),
    }
}

fn handle_search_notes(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: shared_ops::SearchArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    let max = args.limit.unwrap_or(20).min(100);
    let is_semantic = args.mode.as_deref() == Some("semantic");

    if is_semantic {
        match shared_ops::search_notes_hybrid(app, &args.vault_id, &args.query, max) {
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
    } else {
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
}
