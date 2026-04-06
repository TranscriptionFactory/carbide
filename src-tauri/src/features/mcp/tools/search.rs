use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::features::mcp::tools::notes::parse_args;
use crate::features::mcp::types::{InputSchema, PropertySchema, ToolDefinition, ToolResult};
use crate::features::search::model::SearchScope;
use crate::features::search::service::{self as search_service, SearchQueryInput};

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

#[derive(Deserialize)]
struct SearchNotesArgs {
    vault_id: String,
    query: String,
    #[serde(default)]
    limit: Option<usize>,
}

fn handle_search_notes(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: SearchNotesArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    let max = args.limit.unwrap_or(20).min(100);

    let query_input = SearchQueryInput {
        raw: args.query.clone(),
        text: args.query,
        scope: SearchScope::All,
    };

    match search_service::index_search(app.clone(), args.vault_id, query_input) {
        Ok(hits) => {
            let truncated: Vec<_> = hits.into_iter().take(max).collect();
            if truncated.is_empty() {
                return ToolResult::text("No results found.".into());
            }
            let lines: Vec<String> = truncated
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
        Err(e) => ToolResult::error(e),
    }
}
