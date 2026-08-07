use agent_client_protocol::schema::v1::RequestPermissionRequest;
use serde_json::{json, Value};

use crate::features::ai::acp::policy::{build_request_spec, option_kind_name, select_option};
use crate::features::ai::agent_stream::{PermissionOptionKind, PermissionOptionSpec, ToolKind};

// The decision matrix itself lives in PermissionEngine (tests/acp_permissions.rs);
// this file covers the pure wire-shape mapping the session handler feeds it.

fn request(kind: &str, title: &str, options: Value) -> RequestPermissionRequest {
    serde_json::from_value(json!({
        "sessionId": "sess-1",
        "toolCall": {
            "toolCallId": "call-1",
            "title": title,
            "kind": kind,
            "rawInput": { "path": "notes/a.md" },
        },
        "options": options,
    }))
    .expect("fixture should deserialize as a RequestPermissionRequest")
}

fn all_options() -> Value {
    json!([
        { "optionId": "allow-once", "name": "Allow once", "kind": "allow_once" },
        { "optionId": "allow-always", "name": "Always allow", "kind": "allow_always" },
        { "optionId": "reject-once", "name": "Reject", "kind": "reject_once" },
    ])
}

fn spec_option(kind: PermissionOptionKind) -> PermissionOptionSpec {
    PermissionOptionSpec {
        option_id: format!("opt-{}", option_kind_name(kind)),
        label: option_kind_name(kind).to_string(),
        kind,
    }
}

#[test]
fn build_request_spec_maps_the_wire_shape() {
    let spec = build_request_spec("claude", &request("edit", "Edit note", all_options()));

    assert_eq!(spec.agent_id, "claude");
    assert_eq!(spec.tool_call_id.as_deref(), Some("call-1"));
    assert_eq!(spec.name, "Edit note");
    assert_eq!(spec.kind, ToolKind::Edit);
    assert!(spec.mutating);
    assert_eq!(spec.paths, ["notes/a.md"]);
    assert!(spec.input_summary.contains("notes/a.md"));
    assert_eq!(spec.options.len(), 3);
    assert_eq!(spec.options[0].kind, PermissionOptionKind::AllowOnce);
    assert_eq!(spec.options[0].option_id, "allow-once");
}

#[test]
fn a_kindless_tool_call_falls_back_to_name_inference() {
    let request: RequestPermissionRequest = serde_json::from_value(json!({
        "sessionId": "sess-1",
        "toolCall": { "toolCallId": "call-1", "title": "delete_note" },
        "options": [],
    }))
    .expect("fixture should deserialize");

    let spec = build_request_spec("codex", &request);
    assert_eq!(spec.kind, ToolKind::Delete);
    assert!(spec.mutating);
}

#[test]
fn read_kinds_are_not_mutating() {
    let spec = build_request_spec("claude", &request("read", "Read note", all_options()));
    assert_eq!(spec.kind, ToolKind::Read);
    assert!(!spec.mutating);
}

#[test]
fn select_option_prefers_the_mildest_allow() {
    let options = vec![
        spec_option(PermissionOptionKind::AllowAlways),
        spec_option(PermissionOptionKind::AllowOnce),
        spec_option(PermissionOptionKind::RejectOnce),
    ];
    assert_eq!(
        select_option(&options, true).map(|o| o.kind),
        Some(PermissionOptionKind::AllowOnce)
    );
    assert_eq!(
        select_option(&options, false).map(|o| o.kind),
        Some(PermissionOptionKind::RejectOnce)
    );
}

#[test]
fn select_option_falls_back_within_its_side_only() {
    let allow_always_only = vec![spec_option(PermissionOptionKind::AllowAlways)];
    assert_eq!(
        select_option(&allow_always_only, true).map(|o| o.kind),
        Some(PermissionOptionKind::AllowAlways)
    );
    // Refusal with nothing to refuse with: the caller must cancel, never
    // answer with an allow.
    assert!(select_option(&allow_always_only, false).is_none());
}
