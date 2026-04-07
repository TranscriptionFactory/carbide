use crate::features::markdown_lsp::types::MarkdownLspStatus;

#[test]
fn starting_serializes_as_string() {
    let json = serde_json::to_value(&MarkdownLspStatus::Starting).unwrap();
    assert_eq!(json, serde_json::json!("starting"));
}

#[test]
fn running_serializes_as_string() {
    let json = serde_json::to_value(&MarkdownLspStatus::Running).unwrap();
    assert_eq!(json, serde_json::json!("running"));
}

#[test]
fn stopped_serializes_as_string() {
    let json = serde_json::to_value(&MarkdownLspStatus::Stopped).unwrap();
    assert_eq!(json, serde_json::json!("stopped"));
}

#[test]
fn restarting_serializes_as_object() {
    let json = serde_json::to_value(&MarkdownLspStatus::Restarting { attempt: 2 }).unwrap();
    assert_eq!(json, serde_json::json!({"restarting": {"attempt": 2}}));
}

#[test]
fn failed_serializes_as_object() {
    let json = serde_json::to_value(&MarkdownLspStatus::Failed {
        message: "crash".to_string(),
    })
    .unwrap();
    assert_eq!(json, serde_json::json!({"failed": {"message": "crash"}}));
}

#[test]
fn deserialize_roundtrip_starting() {
    let json = serde_json::to_string(&MarkdownLspStatus::Starting).unwrap();
    let rt: MarkdownLspStatus = serde_json::from_str(&json).unwrap();
    assert!(matches!(rt, MarkdownLspStatus::Starting));
}

#[test]
fn deserialize_roundtrip_running() {
    let json = serde_json::to_string(&MarkdownLspStatus::Running).unwrap();
    let rt: MarkdownLspStatus = serde_json::from_str(&json).unwrap();
    assert!(matches!(rt, MarkdownLspStatus::Running));
}

#[test]
fn deserialize_roundtrip_stopped() {
    let json = serde_json::to_string(&MarkdownLspStatus::Stopped).unwrap();
    let rt: MarkdownLspStatus = serde_json::from_str(&json).unwrap();
    assert!(matches!(rt, MarkdownLspStatus::Stopped));
}

#[test]
fn deserialize_roundtrip_restarting() {
    let status = MarkdownLspStatus::Restarting { attempt: 3 };
    let json = serde_json::to_string(&status).unwrap();
    let rt: MarkdownLspStatus = serde_json::from_str(&json).unwrap();
    assert!(matches!(rt, MarkdownLspStatus::Restarting { attempt: 3 }));
}

#[test]
fn deserialize_roundtrip_failed() {
    let status = MarkdownLspStatus::Failed {
        message: "timeout".to_string(),
    };
    let json = serde_json::to_string(&status).unwrap();
    let rt: MarkdownLspStatus = serde_json::from_str(&json).unwrap();
    match rt {
        MarkdownLspStatus::Failed { message } => assert_eq!(message, "timeout"),
        other => panic!("Expected Failed, got {:?}", other),
    }
}
