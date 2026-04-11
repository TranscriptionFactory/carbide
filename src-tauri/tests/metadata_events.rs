use crate::features::notes::service::MetadataChangedEvent;

#[test]
fn upsert_event_serializes_with_event_type_tag() {
    let event = MetadataChangedEvent::Upsert {
        vault_id: "vault-1".to_string(),
        path: "notes/hello.md".to_string(),
    };
    let json = serde_json::to_value(&event).unwrap();
    assert_eq!(json["event_type"], "upsert");
    assert_eq!(json["vault_id"], "vault-1");
    assert_eq!(json["path"], "notes/hello.md");
    assert!(json.get("old_path").is_none());
}

#[test]
fn rename_event_serializes_with_old_path() {
    let event = MetadataChangedEvent::Rename {
        vault_id: "vault-1".to_string(),
        path: "notes/new_name.md".to_string(),
        old_path: "notes/old_name.md".to_string(),
    };
    let json = serde_json::to_value(&event).unwrap();
    assert_eq!(json["event_type"], "rename");
    assert_eq!(json["vault_id"], "vault-1");
    assert_eq!(json["path"], "notes/new_name.md");
    assert_eq!(json["old_path"], "notes/old_name.md");
}

#[test]
fn delete_event_serializes_with_event_type_tag() {
    let event = MetadataChangedEvent::Delete {
        vault_id: "vault-1".to_string(),
        path: "notes/removed.md".to_string(),
    };
    let json = serde_json::to_value(&event).unwrap();
    assert_eq!(json["event_type"], "delete");
    assert_eq!(json["vault_id"], "vault-1");
    assert_eq!(json["path"], "notes/removed.md");
    assert!(json.get("old_path").is_none());
}
