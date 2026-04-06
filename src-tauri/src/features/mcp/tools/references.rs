use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::features::mcp::tools::notes::parse_args;
use crate::features::mcp::types::{InputSchema, PropertySchema, ToolDefinition, ToolResult};
use crate::features::reference::service as reference_service;

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![list_references_def(), search_references_def()]
}

pub fn dispatch(app: &AppHandle, name: &str, arguments: Option<&Value>) -> Option<ToolResult> {
    match name {
        "list_references" => Some(handle_list_references(app, arguments)),
        "search_references" => Some(handle_search_references(app, arguments)),
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

fn list_references_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier"));
    properties.insert(
        "limit".into(),
        PropertySchema {
            prop_type: "integer".into(),
            description: Some("Maximum number of results (default: 50)".into()),
            enum_values: None,
            default: Some(Value::Number(50.into())),
        },
    );

    ToolDefinition {
        name: "list_references".into(),
        description: "List citation references in the vault's library. Returns citekey, title, author, and year for each item.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into()],
        },
    }
}

fn search_references_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier"));
    properties.insert(
        "query".into(),
        prop(
            "string",
            "Search query to match against citekey, title, or author",
        ),
    );

    ToolDefinition {
        name: "search_references".into(),
        description:
            "Search citation references by citekey, title, or author name.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into(), "query".into()],
        },
    }
}

#[derive(Deserialize)]
struct ListReferencesArgs {
    vault_id: String,
    #[serde(default)]
    limit: Option<usize>,
}

#[derive(Deserialize)]
struct SearchReferencesArgs {
    vault_id: String,
    query: String,
}

fn format_csl_item(item: &Value) -> String {
    let citekey = item
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    let title = item
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Untitled");
    let authors = extract_authors(item);
    let year = extract_year(item);

    let mut line = format!("{}\t{}", citekey, title);
    if !authors.is_empty() {
        line.push_str(&format!("\t{}", authors));
    }
    if let Some(y) = year {
        line.push_str(&format!("\t{}", y));
    }
    line
}

fn extract_authors(item: &Value) -> String {
    item.get("author")
        .and_then(|a| a.as_array())
        .map(|authors| {
            authors
                .iter()
                .filter_map(|a| {
                    let family = a.get("family").and_then(|v| v.as_str());
                    let given = a.get("given").and_then(|v| v.as_str());
                    match (family, given) {
                        (Some(f), Some(g)) => Some(format!("{} {}", g, f)),
                        (Some(f), None) => Some(f.to_string()),
                        _ => None,
                    }
                })
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default()
}

fn extract_year(item: &Value) -> Option<String> {
    item.get("issued")
        .and_then(|i| i.get("date-parts"))
        .and_then(|dp| dp.as_array())
        .and_then(|parts| parts.first())
        .and_then(|first| first.as_array())
        .and_then(|date| date.first())
        .and_then(|y| y.as_i64())
        .map(|y| y.to_string())
}

fn matches_query(item: &Value, query: &str) -> bool {
    let q = query.to_lowercase();

    if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
        if id.to_lowercase().contains(&q) {
            return true;
        }
    }

    if let Some(title) = item.get("title").and_then(|v| v.as_str()) {
        if title.to_lowercase().contains(&q) {
            return true;
        }
    }

    let authors = extract_authors(item);
    if authors.to_lowercase().contains(&q) {
        return true;
    }

    false
}

fn handle_list_references(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: ListReferencesArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    let limit = args.limit.unwrap_or(50).min(200);

    match reference_service::reference_load_library(app.clone(), args.vault_id) {
        Ok(library) => {
            if library.items.is_empty() {
                return ToolResult::text("No references in library.".into());
            }
            let total = library.items.len();
            let items: Vec<String> = library
                .items
                .iter()
                .take(limit)
                .map(format_csl_item)
                .collect();
            ToolResult::text(format!(
                "{} references (showing {})\n{}",
                total,
                items.len(),
                items.join("\n")
            ))
        }
        Err(e) => ToolResult::error(e),
    }
}

fn handle_search_references(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: SearchReferencesArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    match reference_service::reference_load_library(app.clone(), args.vault_id) {
        Ok(library) => {
            let matches: Vec<String> = library
                .items
                .iter()
                .filter(|item| matches_query(item, &args.query))
                .take(50)
                .map(format_csl_item)
                .collect();

            if matches.is_empty() {
                return ToolResult::text("No matching references found.".into());
            }
            ToolResult::text(format!("{} matches\n{}", matches.len(), matches.join("\n")))
        }
        Err(e) => ToolResult::error(e),
    }
}
