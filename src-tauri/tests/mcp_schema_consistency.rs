use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Value};

use crate::features::mcp::router::McpRouter;
use crate::features::mcp::shared_ops::{
    CreateNoteArgs, ListNotesArgs, VaultIdArgs, VaultPathArgs, WriteNoteArgs,
    VAULT_ID_OPTIONAL_DESC,
};
use crate::features::mcp::tools::git::{
    GitLogArgs, RenameNoteArgs, VaultArgs as GitVaultArgs,
};
use crate::features::mcp::tools::graph::{PathArgs, QueryByPropertyArgs, VaultArgs as GraphVaultArgs};
use crate::features::mcp::tools::notes::{EditNoteArgs, NoteContentArgs};
use crate::features::mcp::tools::rag::{RagQueryArgs, RagStatusArgs};
use crate::features::mcp::tools::references::{ListReferencesArgs, SearchReferencesArgs};
use crate::features::mcp::tools::search::SearchNotesArgs;
use crate::features::mcp::tools::tasks::QueryTasksArgs;
use crate::features::mcp::types::{InputSchema, ToolDefinition};

/// Field names serde would read for `T`, derived from serializing a default
/// instance. Requires `T: Serialize + Default` with no `skip_serializing_if`
/// on the arg fields (arg structs use `#[serde(default)]` only).
fn fields_of<T: Serialize + Default>() -> Vec<String> {
    let v = serde_json::to_value(T::default()).expect("arg struct serializes");
    v.as_object()
        .expect("arg struct serializes to a JSON object")
        .keys()
        .cloned()
        .collect()
}

fn dummy_object_excluding(schema: &InputSchema, exclude: &str) -> Value {
    let mut map = serde_json::Map::new();
    for (name, prop) in &schema.properties {
        if name == exclude {
            continue;
        }
        let dummy = match prop.prop_type.as_str() {
            "string" => json!(""),
            "integer" | "number" => json!(0),
            "boolean" => json!(false),
            _ => Value::Null,
        };
        map.insert(name.clone(), dummy);
    }
    Value::Object(map)
}

fn check_tool<T: Serialize + Default + DeserializeOwned>(def: &ToolDefinition) {
    // (a) No undeclared-but-parsed params: every serde field is declared.
    for field in fields_of::<T>() {
        assert!(
            def.input_schema.properties.contains_key(&field),
            "{}: serde field `{}` is parsed but not declared in the schema",
            def.name,
            field
        );
    }

    // (b) A tool that describes vault_id as optional must genuinely parse
    //     without it (and must not list it as required).
    if let Some(prop) = def.input_schema.properties.get("vault_id") {
        if prop.description.as_deref() == Some(VAULT_ID_OPTIONAL_DESC) {
            assert!(
                !def.input_schema.required.contains(&"vault_id".to_string()),
                "{}: vault_id is described as optional but listed in required",
                def.name
            );
            let args = dummy_object_excluding(&def.input_schema, "vault_id");
            assert!(
                serde_json::from_value::<T>(args.clone()).is_ok(),
                "{}: is described as optional-vault but fails to parse without vault_id (args={})",
                def.name,
                args
            );
        }
    }
}

fn check(def: &ToolDefinition) {
    match def.name.as_str() {
        "list_notes" => check_tool::<ListNotesArgs>(def),
        "read_note" | "delete_note" | "ensure_frontmatter" | "get_note_metadata" => {
            check_tool::<VaultPathArgs>(def)
        }
        "create_note" => check_tool::<CreateNoteArgs>(def),
        "update_note" => check_tool::<WriteNoteArgs>(def),
        "edit_note" => check_tool::<EditNoteArgs>(def),
        "append_note" | "prepend_note" => check_tool::<NoteContentArgs>(def),
        "search_notes" => check_tool::<SearchNotesArgs>(def),
        "reindex" => check_tool::<VaultIdArgs>(def),
        "list_vaults" => assert!(
            def.input_schema.properties.is_empty(),
            "list_vaults is expected to declare no properties"
        ),
        "get_backlinks" | "get_outgoing_links" => check_tool::<PathArgs>(def),
        "list_properties" => check_tool::<GraphVaultArgs>(def),
        "query_notes_by_property" => check_tool::<QueryByPropertyArgs>(def),
        "list_references" => check_tool::<ListReferencesArgs>(def),
        "search_references" => check_tool::<SearchReferencesArgs>(def),
        "git_status" => check_tool::<GitVaultArgs>(def),
        "git_log" => check_tool::<GitLogArgs>(def),
        "rename_note" => check_tool::<RenameNoteArgs>(def),
        "query_tasks" => check_tool::<QueryTasksArgs>(def),
        "rag_query" => check_tool::<RagQueryArgs>(def),
        "rag_status" => check_tool::<RagStatusArgs>(def),
        other => panic!(
            "tool `{}` has no schema-consistency mapping; add it to mcp_schema_consistency::check",
            other
        ),
    }
}

#[test]
fn every_tool_declares_all_parsed_params_and_honors_optional_vault_id() {
    let router = McpRouter::new();
    let defs = router.tool_definitions_public();
    assert!(!defs.is_empty(), "expected a non-empty tool catalog");
    for def in &defs {
        check(def);
    }
}

#[test]
fn create_note_declares_overwrite() {
    let router = McpRouter::new();
    let def = router
        .tool_definitions_public()
        .into_iter()
        .find(|d| d.name == "create_note")
        .expect("create_note exists");
    assert!(
        def.input_schema.properties.contains_key("overwrite"),
        "create_note must declare the overwrite param it parses"
    );
}
