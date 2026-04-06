use crate::features::mcp::tools::git;

#[test]
fn git_tool_definitions_count() {
    let defs = git::tool_definitions();
    assert_eq!(defs.len(), 3);
}

#[test]
fn git_status_requires_vault_id() {
    let defs = git::tool_definitions();
    let def = defs.iter().find(|d| d.name == "git_status").unwrap();
    assert!(def.input_schema.required.contains(&"vault_id".to_string()));
    assert_eq!(def.input_schema.required.len(), 1);
}

#[test]
fn git_log_requires_vault_id() {
    let defs = git::tool_definitions();
    let def = defs.iter().find(|d| d.name == "git_log").unwrap();
    assert!(def.input_schema.required.contains(&"vault_id".to_string()));
    assert_eq!(def.input_schema.required.len(), 1);
}

#[test]
fn git_log_has_optional_limit() {
    let defs = git::tool_definitions();
    let def = defs.iter().find(|d| d.name == "git_log").unwrap();
    let limit_prop = def.input_schema.properties.get("limit").unwrap();
    assert_eq!(limit_prop.prop_type, "integer");
    assert!(!def.input_schema.required.contains(&"limit".to_string()));
}

#[test]
fn rename_note_requires_vault_id_old_path_new_path() {
    let defs = git::tool_definitions();
    let def = defs.iter().find(|d| d.name == "rename_note").unwrap();
    assert!(def.input_schema.required.contains(&"vault_id".to_string()));
    assert!(def
        .input_schema
        .required
        .contains(&"old_path".to_string()));
    assert!(def
        .input_schema
        .required
        .contains(&"new_path".to_string()));
    assert_eq!(def.input_schema.required.len(), 3);
}

#[test]
fn all_git_tools_are_snake_case() {
    for def in git::tool_definitions() {
        assert!(
            def.name.chars().all(|c| c.is_ascii_lowercase() || c == '_'),
            "{} should be snake_case",
            def.name
        );
    }
}

#[test]
fn all_git_tools_have_descriptions() {
    for def in git::tool_definitions() {
        assert!(
            !def.description.is_empty(),
            "{} should have a description",
            def.name
        );
    }
}

#[test]
fn all_git_schemas_are_object_type() {
    for def in git::tool_definitions() {
        assert_eq!(
            def.input_schema.schema_type, "object",
            "{} schema should be object type",
            def.name
        );
    }
}

#[test]
fn all_git_properties_have_type_and_description() {
    for def in git::tool_definitions() {
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
