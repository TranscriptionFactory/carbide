use crate::features::mcp::types::*;
use serde_json::json;

#[test]
fn parse_valid_request() {
    let input = r#"{"jsonrpc":"2.0","method":"ping","id":1}"#;
    let req = parse_jsonrpc(input).unwrap();
    assert_eq!(req.method, "ping");
    assert_eq!(req.id, Some(JsonRpcId::Number(1)));
    assert!(req.params.is_none());
}

#[test]
fn parse_request_with_string_id() {
    let input = r#"{"jsonrpc":"2.0","method":"tools/list","id":"abc-123"}"#;
    let req = parse_jsonrpc(input).unwrap();
    assert_eq!(req.id, Some(JsonRpcId::String("abc-123".into())));
}

#[test]
fn parse_request_with_params() {
    let input = r#"{"jsonrpc":"2.0","method":"tools/call","params":{"name":"read_note","arguments":{"path":"test.md"}},"id":2}"#;
    let req = parse_jsonrpc(input).unwrap();
    assert_eq!(req.method, "tools/call");
    let params = req.params.unwrap();
    assert_eq!(params["name"], "read_note");
    assert_eq!(params["arguments"]["path"], "test.md");
}

#[test]
fn parse_notification_has_no_id() {
    let input = r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#;
    let req = parse_jsonrpc(input).unwrap();
    assert!(req.is_notification());
    assert!(req.id.is_none());
}

#[test]
fn parse_invalid_json_returns_parse_error() {
    let input = r#"{"broken json"#;
    let err = parse_jsonrpc(input).unwrap_err();
    let error = err.error.unwrap();
    assert_eq!(error.code, PARSE_ERROR);
}

#[test]
fn validate_rejects_wrong_version() {
    let input = r#"{"jsonrpc":"1.0","method":"ping","id":1}"#;
    let req = parse_jsonrpc(input).unwrap();
    let err = req.validate().unwrap_err();
    assert_eq!(err.code, INVALID_REQUEST);
}

#[test]
fn validate_rejects_empty_method() {
    let input = r#"{"jsonrpc":"2.0","method":"","id":1}"#;
    let req = parse_jsonrpc(input).unwrap();
    let err = req.validate().unwrap_err();
    assert_eq!(err.code, INVALID_REQUEST);
}

#[test]
fn validate_passes_for_valid_request() {
    let input = r#"{"jsonrpc":"2.0","method":"ping","id":1}"#;
    let req = parse_jsonrpc(input).unwrap();
    assert!(req.validate().is_ok());
}

#[test]
fn response_success_serializes() {
    let resp = JsonRpcResponse::success(Some(JsonRpcId::Number(1)), json!({"status": "ok"}));
    let s = serde_json::to_string(&resp).unwrap();
    let v: serde_json::Value = serde_json::from_str(&s).unwrap();
    assert_eq!(v["jsonrpc"], "2.0");
    assert_eq!(v["result"]["status"], "ok");
    assert!(v.get("error").is_none());
}

#[test]
fn response_error_serializes() {
    let resp = JsonRpcResponse::error(
        Some(JsonRpcId::Number(1)),
        JsonRpcError {
            code: METHOD_NOT_FOUND,
            message: "not found".into(),
            data: None,
        },
    );
    let s = serde_json::to_string(&resp).unwrap();
    let v: serde_json::Value = serde_json::from_str(&s).unwrap();
    assert_eq!(v["error"]["code"], METHOD_NOT_FOUND);
    assert!(v.get("result").is_none());
}

#[test]
fn tool_result_text() {
    let r = ToolResult::text("hello".into());
    assert!(!r.is_error);
    assert_eq!(r.content.len(), 1);
    match &r.content[0] {
        ContentBlock::Text { text } => assert_eq!(text, "hello"),
    }
}

#[test]
fn tool_result_error() {
    let r = ToolResult::error("oops".into());
    assert!(r.is_error);
}

#[test]
fn tool_definition_round_trip() {
    let tool = ToolDefinition {
        name: "read_note".into(),
        description: "Read a note".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties: {
                let mut m = std::collections::HashMap::new();
                m.insert(
                    "path".into(),
                    PropertySchema {
                        prop_type: "string".into(),
                        description: Some("Note path".into()),
                        enum_values: None,
                        default: None,
                    },
                );
                m
            },
            required: vec!["path".into()],
        },
    };
    let s = serde_json::to_string(&tool).unwrap();
    let parsed: ToolDefinition = serde_json::from_str(&s).unwrap();
    assert_eq!(parsed.name, "read_note");
    assert_eq!(parsed.input_schema.required, vec!["path"]);
}

#[test]
fn content_block_text_serializes_with_type_tag() {
    let block = ContentBlock::Text {
        text: "hello".into(),
    };
    let v = serde_json::to_value(&block).unwrap();
    assert_eq!(v["type"], "text");
    assert_eq!(v["text"], "hello");
}
