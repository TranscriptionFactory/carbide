use agent_client_protocol::schema::v1::RequestPermissionRequest;
use serde_json::{json, Value};

use crate::features::ai::acp::permissions::option_kind_name;
use crate::features::ai::acp::policy::{build_request_spec, select_allow};
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
fn a_carbide_mcp_tool_arrives_pre_authorized() {
    let mcp = build_request_spec(
        "claude",
        &request("delete", "mcp__carbide__delete_note", all_options()),
    );
    let plain = build_request_spec("claude", &request("delete", "Delete note", all_options()));

    assert!(mcp.pre_authorized);
    assert!(!plain.pre_authorized);
}

#[test]
fn select_allow_prefers_the_mildest_grant() {
    let options = vec![
        spec_option(PermissionOptionKind::AllowAlways),
        spec_option(PermissionOptionKind::AllowOnce),
        spec_option(PermissionOptionKind::RejectOnce),
    ];
    assert_eq!(
        select_allow(&options).map(|o| o.kind),
        Some(PermissionOptionKind::AllowOnce)
    );
}

#[test]
fn select_allow_never_answers_with_a_refusal() {
    let allow_always_only = vec![spec_option(PermissionOptionKind::AllowAlways)];
    assert_eq!(
        select_allow(&allow_always_only).map(|o| o.kind),
        Some(PermissionOptionKind::AllowAlways)
    );
    assert!(select_allow(&[spec_option(PermissionOptionKind::RejectOnce)]).is_none());
}
