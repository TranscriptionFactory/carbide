use crate::features::mcp::tools::{graph, references};

#[test]
fn graph_tool_definitions_count() {
    let defs = graph::tool_definitions();
    assert_eq!(defs.len(), 4);
}

#[test]
fn get_backlinks_requires_vault_id_and_path() {
    let defs = graph::tool_definitions();
    let def = defs.iter().find(|d| d.name == "get_backlinks").unwrap();
    assert!(def.input_schema.required.contains(&"vault_id".to_string()));
    assert!(def.input_schema.required.contains(&"path".to_string()));
}

#[test]
fn get_outgoing_links_requires_vault_id_and_path() {
    let defs = graph::tool_definitions();
    let def = defs
        .iter()
        .find(|d| d.name == "get_outgoing_links")
        .unwrap();
    assert!(def.input_schema.required.contains(&"vault_id".to_string()));
    assert!(def.input_schema.required.contains(&"path".to_string()));
}

#[test]
fn list_properties_requires_vault_id() {
    let defs = graph::tool_definitions();
    let def = defs.iter().find(|d| d.name == "list_properties").unwrap();
    assert!(def.input_schema.required.contains(&"vault_id".to_string()));
    assert_eq!(def.input_schema.required.len(), 1);
}

#[test]
fn query_notes_by_property_requires_vault_id_and_property() {
    let defs = graph::tool_definitions();
    let def = defs
        .iter()
        .find(|d| d.name == "query_notes_by_property")
        .unwrap();
    assert!(def.input_schema.required.contains(&"vault_id".to_string()));
    assert!(def
        .input_schema
        .required
        .contains(&"property".to_string()));
    assert!(!def.input_schema.required.contains(&"value".to_string()));
    assert!(!def
        .input_schema
        .required
        .contains(&"operator".to_string()));
}

#[test]
fn query_notes_by_property_has_operator_enum() {
    let defs = graph::tool_definitions();
    let def = defs
        .iter()
        .find(|d| d.name == "query_notes_by_property")
        .unwrap();
    let op_prop = def.input_schema.properties.get("operator").unwrap();
    let enums = op_prop.enum_values.as_ref().unwrap();
    assert!(enums.contains(&"eq".to_string()));
    assert!(enums.contains(&"neq".to_string()));
    assert!(enums.contains(&"contains".to_string()));
    assert!(enums.contains(&"gt".to_string()));
    assert!(enums.contains(&"lt".to_string()));
}

#[test]
fn references_tool_definitions_count() {
    let defs = references::tool_definitions();
    assert_eq!(defs.len(), 2);
}

#[test]
fn list_references_requires_vault_id() {
    let defs = references::tool_definitions();
    let def = defs
        .iter()
        .find(|d| d.name == "list_references")
        .unwrap();
    assert!(def.input_schema.required.contains(&"vault_id".to_string()));
    assert!(!def.input_schema.required.contains(&"limit".to_string()));
}

#[test]
fn search_references_requires_vault_id_and_query() {
    let defs = references::tool_definitions();
    let def = defs
        .iter()
        .find(|d| d.name == "search_references")
        .unwrap();
    assert!(def.input_schema.required.contains(&"vault_id".to_string()));
    assert!(def.input_schema.required.contains(&"query".to_string()));
}

#[test]
fn all_graph_tools_are_snake_case() {
    let all_defs: Vec<_> = graph::tool_definitions()
        .into_iter()
        .chain(references::tool_definitions())
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
fn all_graph_tools_have_descriptions() {
    let all_defs: Vec<_> = graph::tool_definitions()
        .into_iter()
        .chain(references::tool_definitions())
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
fn all_graph_schemas_are_object_type() {
    let all_defs: Vec<_> = graph::tool_definitions()
        .into_iter()
        .chain(references::tool_definitions())
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
fn all_graph_properties_have_type_and_description() {
    let all_defs: Vec<_> = graph::tool_definitions()
        .into_iter()
        .chain(references::tool_definitions())
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
