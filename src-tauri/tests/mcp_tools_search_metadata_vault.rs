use crate::features::mcp::tools::{metadata, search, vault};

#[test]
fn search_tool_definitions_count() {
    let defs = search::tool_definitions();
    assert_eq!(defs.len(), 1);
}

#[test]
fn search_notes_requires_vault_id_and_query() {
    let defs = search::tool_definitions();
    let search_def = defs.iter().find(|d| d.name == "search_notes").unwrap();
    assert!(search_def
        .input_schema
        .required
        .contains(&"vault_id".to_string()));
    assert!(search_def
        .input_schema
        .required
        .contains(&"query".to_string()));
}

#[test]
fn search_notes_has_optional_limit() {
    let defs = search::tool_definitions();
    let search_def = defs.iter().find(|d| d.name == "search_notes").unwrap();
    assert!(search_def.input_schema.properties.contains_key("limit"));
    assert!(
        !search_def
            .input_schema
            .required
            .contains(&"limit".to_string())
    );
}

#[test]
fn metadata_tool_definitions_count() {
    let defs = metadata::tool_definitions();
    assert_eq!(defs.len(), 1);
}

#[test]
fn get_note_metadata_requires_vault_id_and_path() {
    let defs = metadata::tool_definitions();
    let meta_def = defs
        .iter()
        .find(|d| d.name == "get_note_metadata")
        .unwrap();
    assert!(meta_def
        .input_schema
        .required
        .contains(&"vault_id".to_string()));
    assert!(meta_def
        .input_schema
        .required
        .contains(&"path".to_string()));
}

#[test]
fn vault_tool_definitions_count() {
    let defs = vault::tool_definitions();
    assert_eq!(defs.len(), 1);
}

#[test]
fn list_vaults_has_no_required_params() {
    let defs = vault::tool_definitions();
    let vault_def = defs.iter().find(|d| d.name == "list_vaults").unwrap();
    assert!(vault_def.input_schema.required.is_empty());
}

#[test]
fn all_new_tools_are_snake_case() {
    let all_defs: Vec<_> = search::tool_definitions()
        .into_iter()
        .chain(metadata::tool_definitions())
        .chain(vault::tool_definitions())
        .collect();
    for def in &all_defs {
        assert!(
            def.name.chars().all(|c| c.is_ascii_lowercase() || c == '_'),
            "{} should be snake_case",
            def.name
        );
    }
}

#[test]
fn all_new_tools_have_descriptions() {
    let all_defs: Vec<_> = search::tool_definitions()
        .into_iter()
        .chain(metadata::tool_definitions())
        .chain(vault::tool_definitions())
        .collect();
    for def in &all_defs {
        assert!(
            !def.description.is_empty(),
            "{} should have a description",
            def.name
        );
    }
}

#[test]
fn all_new_schemas_are_object_type() {
    let all_defs: Vec<_> = search::tool_definitions()
        .into_iter()
        .chain(metadata::tool_definitions())
        .chain(vault::tool_definitions())
        .collect();
    for def in &all_defs {
        assert_eq!(
            def.input_schema.schema_type, "object",
            "{} schema should be object type",
            def.name
        );
    }
}

#[test]
fn all_new_properties_have_type_and_description() {
    let all_defs: Vec<_> = search::tool_definitions()
        .into_iter()
        .chain(metadata::tool_definitions())
        .chain(vault::tool_definitions())
        .collect();
    for def in &all_defs {
        for (name, prop) in &def.input_schema.properties {
            assert!(
                !prop.prop_type.is_empty(),
                "{}.{} should have a type",
                def.name,
                name
            );
            assert!(
                prop.description.is_some(),
                "{}.{} should have a description",
                def.name,
                name
            );
        }
    }
}

#[test]
fn router_lists_all_fourteen_tools() {
    use crate::features::mcp::router::McpRouter;
    use crate::features::mcp::types::*;
    use serde_json::json;

    let mut router = McpRouter::new();

    let init_req = JsonRpcRequest {
        jsonrpc: "2.0".into(),
        method: "initialize".into(),
        params: Some(json!({
            "protocol_version": "2024-11-05",
            "capabilities": {},
            "client_info": { "name": "test", "version": "1.0" }
        })),
        id: Some(JsonRpcId::Number(1)),
    };
    router.handle_request(&init_req);

    let list_req = JsonRpcRequest {
        jsonrpc: "2.0".into(),
        method: "tools/list".into(),
        params: None,
        id: Some(JsonRpcId::Number(2)),
    };
    let resp = router.handle_request(&list_req).unwrap();
    let result = resp.result.unwrap();
    let tools = result["tools"].as_array().unwrap();
    assert_eq!(tools.len(), 14);

    let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
    assert!(names.contains(&"list_notes"));
    assert!(names.contains(&"read_note"));
    assert!(names.contains(&"create_note"));
    assert!(names.contains(&"update_note"));
    assert!(names.contains(&"delete_note"));
    assert!(names.contains(&"search_notes"));
    assert!(names.contains(&"get_note_metadata"));
    assert!(names.contains(&"list_vaults"));
    assert!(names.contains(&"get_backlinks"));
    assert!(names.contains(&"get_outgoing_links"));
    assert!(names.contains(&"list_properties"));
    assert!(names.contains(&"query_notes_by_property"));
    assert!(names.contains(&"list_references"));
    assert!(names.contains(&"search_references"));
}

#[test]
fn dispatch_unknown_tool_returns_error() {
    use crate::features::mcp::router::McpRouter;
    use crate::features::mcp::types::*;
    use serde_json::json;

    let mut router = McpRouter::new();

    let req = JsonRpcRequest {
        jsonrpc: "2.0".into(),
        method: "tools/call".into(),
        params: Some(json!({
            "name": "nonexistent_tool",
            "arguments": {}
        })),
        id: Some(JsonRpcId::Number(1)),
    };
    let resp = router.handle_request(&req).unwrap();
    let result = resp.result.unwrap();
    assert!(result["is_error"].as_bool().unwrap_or(false));
}
