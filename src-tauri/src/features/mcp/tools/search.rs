use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::features::mcp::shared_ops::{self, VAULT_ID_OPTIONAL_DESC};
use crate::features::mcp::tools::{op_err_to_tool_result, parse_args, prop};
use crate::features::mcp::types::{InputSchema, PropertySchema, ToolDefinition, ToolResult};

#[derive(Default, Serialize, Deserialize)]
pub(crate) struct SearchNotesArgs {
    #[serde(default)]
    pub vault_id: Option<String>,
    pub query: String,
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub mode: Option<String>,
}

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
    properties.insert("vault_id".into(), prop("string", VAULT_ID_OPTIONAL_DESC));
    properties.insert("query".into(), prop("string", "Search query text. In text mode, query terms are AND-ed together with prefix matching; phrase quotes and boolean operators (AND/OR/NOT) are not supported and are treated as literal words."));
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
        mutating: false,
        description: "Search across note titles and content. Text mode (default) is full-text search: query terms are AND-ed with prefix matching, and quotes/boolean operators are not supported (treated as literal words). Semantic mode adds hybrid vector + FTS retrieval for conceptual queries. Returns tab-separated lines of path, title, and relevance score (positive, higher is better; scale differs between modes), with matching text snippets on the next line.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["query".into()],
        },
    }
}

fn reindex_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert("vault_id".into(), prop("string", "Vault identifier (use list_vaults to discover IDs)"));

    ToolDefinition {
        name: "reindex".into(),
        mutating: true,
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
    let args: SearchNotesArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    let vault_id = match shared_ops::resolve_vault_id(app, args.vault_id) {
        Ok(v) => v,
        Err(e) => return op_err_to_tool_result(e),
    };

    let max = args.limit.unwrap_or(20).min(100);
    let is_semantic = args.mode.as_deref() == Some("semantic");

    if is_semantic {
        match shared_ops::search_notes_hybrid(app, &vault_id, &args.query, max) {
            Ok((hits, fallback)) => {
                let body = format_hits(hits.iter().map(|hit| {
                    (
                        hit.note.path.as_str(),
                        hit.note.title.as_str(),
                        hit.score,
                        hit.snippet.as_deref(),
                    )
                }));
                let text = match fallback {
                    Some(reason) => format!(
                        "note: semantic search unavailable ({}); returning keyword-only results\n{}",
                        reason, body
                    ),
                    None => body,
                };
                ToolResult::text(text)
            }
            Err(e) => op_err_to_tool_result(e),
        }
    } else {
        match shared_ops::search_notes_index(app, &vault_id, &args.query, max) {
            Ok(hits) => ToolResult::text(format_hits(hits.iter().map(|hit| {
                (
                    hit.note.path.as_str(),
                    hit.note.title.as_str(),
                    hit.score,
                    hit.snippet.as_deref(),
                )
            }))),
            Err(e) => op_err_to_tool_result(e),
        }
    }
}

fn format_hits<'a>(
    hits: impl Iterator<Item = (&'a str, &'a str, f32, Option<&'a str>)>,
) -> String {
    let lines: Vec<String> = hits
        .map(|(path, title, score, snippet)| {
            let snippet = snippet.map(|s| format!("\n  {}", s)).unwrap_or_default();
            format!("{}\t{}\t{:.2}{}", path, title, score, snippet)
        })
        .collect();
    if lines.is_empty() {
        "No results found.".into()
    } else {
        lines.join("\n")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_hits_returns_placeholder_when_empty() {
        assert_eq!(format_hits(std::iter::empty()), "No results found.");
    }

    #[test]
    fn format_hits_emits_tab_separated_lines_with_indented_snippets() {
        let hits = vec![
            ("a.md", "Alpha", 0.5f32, Some("match text")),
            ("b.md", "Beta", 0.25f32, None),
        ];
        assert_eq!(
            format_hits(hits.into_iter()),
            "a.md\tAlpha\t0.50\n  match text\nb.md\tBeta\t0.25"
        );
    }
}
