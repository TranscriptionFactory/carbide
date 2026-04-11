use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::features::mcp::tools::{parse_args, prop};
use crate::features::mcp::types::{InputSchema, PropertySchema, ToolDefinition, ToolResult};
use crate::features::search::db as search_db;
use crate::features::search::model::{BaseFilter, BaseQuery};
use crate::features::search::service as search_service;

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![
        get_backlinks_def(),
        get_outgoing_links_def(),
        list_properties_def(),
        query_notes_by_property_def(),
    ]
}

pub fn dispatch(app: &AppHandle, name: &str, arguments: Option<&Value>) -> Option<ToolResult> {
    match name {
        "get_backlinks" => Some(handle_get_backlinks(app, arguments)),
        "get_outgoing_links" => Some(handle_get_outgoing_links(app, arguments)),
        "list_properties" => Some(handle_list_properties(app, arguments)),
        "query_notes_by_property" => Some(handle_query_notes_by_property(app, arguments)),
        _ => None,
    }
}

fn get_backlinks_def() -> ToolDefinition {
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
        name: "get_backlinks".into(),
        description: "Get all notes that link to the specified note (incoming links).".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into(), "path".into()],
        },
    }
}

fn get_outgoing_links_def() -> ToolDefinition {
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
        name: "get_outgoing_links".into(),
        description:
            "Get all notes that the specified note links to (outgoing links, resolved to existing notes)."
                .into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into(), "path".into()],
        },
    }
}

fn list_properties_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier"));

    ToolDefinition {
        name: "list_properties".into(),
        description: "List all frontmatter property names with their inferred types, occurrence counts, and sample values.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into()],
        },
    }
}

fn query_notes_by_property_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier"));
    properties.insert(
        "property".into(),
        prop("string", "Property name to filter on"),
    );
    properties.insert(
        "value".into(),
        prop(
            "string",
            "Value to match against (optional for existence check)",
        ),
    );
    properties.insert(
        "operator".into(),
        PropertySchema {
            prop_type: "string".into(),
            description: Some("Comparison operator (default: eq)".into()),
            enum_values: Some(vec![
                "eq".into(),
                "neq".into(),
                "contains".into(),
                "gt".into(),
                "gte".into(),
                "lt".into(),
                "lte".into(),
            ]),
            default: Some(Value::String("eq".into())),
        },
    );
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
        name: "query_notes_by_property".into(),
        description: "Find notes matching a frontmatter property filter. Supports equality, comparison, and contains operators.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into(), "property".into()],
        },
    }
}

#[derive(Deserialize)]
struct PathArgs {
    vault_id: String,
    path: String,
}

#[derive(Deserialize)]
struct VaultArgs {
    vault_id: String,
}

#[derive(Deserialize)]
struct QueryByPropertyArgs {
    vault_id: String,
    property: String,
    #[serde(default)]
    value: Option<String>,
    #[serde(default)]
    operator: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
}

fn handle_get_backlinks(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: PathArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    match search_service::with_read_conn(app, &args.vault_id, |conn| {
        search_db::get_backlinks(conn, &args.path)
    }) {
        Ok(notes) => {
            if notes.is_empty() {
                return ToolResult::text("No backlinks found.".into());
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

fn handle_get_outgoing_links(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: PathArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    match search_service::with_read_conn(app, &args.vault_id, |conn| {
        search_db::get_outlinks(conn, &args.path)
    }) {
        Ok(notes) => {
            if notes.is_empty() {
                return ToolResult::text("No outgoing links found.".into());
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

fn handle_list_properties(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: VaultArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    match search_service::with_read_conn(app, &args.vault_id, |conn| {
        search_db::list_all_properties(conn)
    }) {
        Ok(props) => {
            if props.is_empty() {
                return ToolResult::text("No properties found.".into());
            }
            let lines: Vec<String> = props
                .iter()
                .map(|p| {
                    let values_str = p
                        .unique_values
                        .as_ref()
                        .map(|vs| {
                            if vs.is_empty() {
                                String::new()
                            } else {
                                format!("\n  values: {}", vs.join(", "))
                            }
                        })
                        .unwrap_or_default();
                    format!(
                        "{} ({})\t{} notes{}",
                        p.name, p.property_type, p.count, values_str
                    )
                })
                .collect();
            ToolResult::text(lines.join("\n"))
        }
        Err(e) => ToolResult::error(e),
    }
}

fn handle_query_notes_by_property(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: QueryByPropertyArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    let operator = args.operator.unwrap_or_else(|| "eq".into());
    let value = args.value.unwrap_or_default();
    let limit = args.limit.unwrap_or(50).min(200);

    let query = BaseQuery {
        filters: vec![BaseFilter {
            property: args.property,
            operator,
            value,
        }],
        sort: vec![],
        limit,
        offset: 0,
    };

    match search_service::with_read_conn(app, &args.vault_id, |conn| {
        search_db::query_bases(conn, query)
    }) {
        Ok(results) => {
            if results.rows.is_empty() {
                return ToolResult::text("No matching notes found.".into());
            }
            let lines: Vec<String> = results
                .rows
                .iter()
                .map(|row| {
                    let props_str: Vec<String> = row
                        .properties
                        .iter()
                        .map(|(k, v)| format!("{}={}", k, v.value))
                        .collect();
                    let tags_str = if row.tags.is_empty() {
                        String::new()
                    } else {
                        format!("\ttags: {}", row.tags.join(", "))
                    };
                    format!(
                        "{}\t{}\t{{{}}}{}",
                        row.note.path,
                        row.note.title,
                        props_str.join(", "),
                        tags_str
                    )
                })
                .collect();
            ToolResult::text(format!(
                "{} results (of {} total)\n{}",
                results.rows.len(),
                results.total,
                lines.join("\n")
            ))
        }
        Err(e) => ToolResult::error(e),
    }
}
