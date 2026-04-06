use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::features::mcp::tools::notes::parse_args;
use crate::features::mcp::types::{InputSchema, PropertySchema, ToolDefinition, ToolResult};
use crate::features::notes::service::build_note_meta;
use crate::features::search::db as search_db;
use crate::features::search::service as search_service;
use crate::shared::storage;

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![get_note_metadata_def()]
}

pub fn dispatch(app: &AppHandle, name: &str, arguments: Option<&Value>) -> Option<ToolResult> {
    match name {
        "get_note_metadata" => Some(handle_get_note_metadata(app, arguments)),
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

fn get_note_metadata_def() -> ToolDefinition {
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
        name: "get_note_metadata".into(),
        description: "Get metadata for a note including title, tags, properties, and statistics (word count, links, etc).".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into(), "path".into()],
        },
    }
}

#[derive(Deserialize)]
struct GetNoteMetadataArgs {
    vault_id: String,
    path: String,
}

fn handle_get_note_metadata(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: GetNoteMetadataArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    let root = match storage::vault_path(app, &args.vault_id) {
        Ok(r) => r,
        Err(e) => return ToolResult::error(e),
    };

    let meta = match build_note_meta(&root, &args.path, None) {
        Ok(m) => m,
        Err(e) => return ToolResult::error(e),
    };

    let mut output = format!(
        "path: {}\ntitle: {}\nsize: {} bytes\nmodified: {}",
        meta.path, meta.title, meta.size_bytes, meta.mtime_ms
    );

    if let Ok(stats) =
        search_service::get_note_stats(app.clone(), args.vault_id.clone(), args.path.clone())
    {
        output.push_str(&format!(
            "\nwords: {}\nchars: {}\nheadings: {}\noutlinks: {}\nreading_time: {}s\ntasks: {}/{} done",
            stats.word_count,
            stats.char_count,
            stats.heading_count,
            stats.outlink_count,
            stats.reading_time_secs,
            stats.tasks_done,
            stats.task_count
        ));
    }

    if let Ok(tags_and_props) = search_service::with_read_conn(app, &args.vault_id, |conn| {
        let tags = search_db::get_note_tags(conn, &args.path)?;
        let props = search_db::get_note_properties(conn, &args.path)?;
        Ok((tags, props))
    }) {
        let (tags, props) = tags_and_props;
        if !tags.is_empty() {
            output.push_str(&format!("\ntags: {}", tags.join(", ")));
        }
        if !props.is_empty() {
            output.push('\n');
            for (key, (value, prop_type)) in &props {
                output.push_str(&format!("\n{}({}): {}", key, prop_type, value));
            }
        }
    }

    ToolResult::text(output)
}
