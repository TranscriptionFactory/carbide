use crate::features::mcp::tools::notes;

#[test]
fn tool_definitions_count() {
    let defs = notes::tool_definitions();
    assert_eq!(defs.len(), 5);
}

#[test]
fn all_tools_require_vault_id() {
    let defs = notes::tool_definitions();
    for def in &defs {
        assert!(
            def.input_schema.required.contains(&"vault_id".to_string()),
            "{} should require vault_id",
            def.name
        );
    }
}

#[test]
fn tool_names_are_snake_case() {
    let defs = notes::tool_definitions();
    for def in &defs {
        assert!(
            def.name.chars().all(|c| c.is_ascii_lowercase() || c == '_'),
            "{} should be snake_case",
            def.name
        );
    }
}

#[test]
fn create_note_requires_path_and_content() {
    let defs = notes::tool_definitions();
    let create = defs.iter().find(|d| d.name == "create_note").unwrap();
    assert!(create.input_schema.required.contains(&"path".to_string()));
    assert!(create.input_schema.required.contains(&"content".to_string()));
}

#[test]
fn read_note_requires_path() {
    let defs = notes::tool_definitions();
    let read = defs.iter().find(|d| d.name == "read_note").unwrap();
    assert!(read.input_schema.required.contains(&"path".to_string()));
}

#[test]
fn all_schemas_are_object_type() {
    let defs = notes::tool_definitions();
    for def in &defs {
        assert_eq!(
            def.input_schema.schema_type, "object",
            "{} schema should be object type",
            def.name
        );
    }
}

#[test]
fn all_tools_have_descriptions() {
    let defs = notes::tool_definitions();
    for def in &defs {
        assert!(
            !def.description.is_empty(),
            "{} should have a description",
            def.name
        );
    }
}

#[test]
fn all_properties_have_type_and_description() {
    let defs = notes::tool_definitions();
    for def in &defs {
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
