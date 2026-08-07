use agent_client_protocol::schema::v1::RequestPermissionRequest;
use serde_json::{json, Value};

use crate::features::ai::acp::auto_decide;
use crate::features::ai::agent_stream::{AgentEvent, ToolSelector};

fn request(kind: &str, title: &str, options: Value) -> RequestPermissionRequest {
    serde_json::from_value(json!({
        "sessionId": "sess-1",
        "toolCall": { "toolCallId": "call-1", "title": title, "kind": kind },
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

fn assert_resolved(event: &AgentEvent, outcome: &str) {
    let AgentEvent::PermissionResolved {
        request_id,
        outcome: actual,
        auto,
    } = event
    else {
        panic!("expected a permission_resolved event, got {event:?}");
    };
    assert_eq!(request_id, "call-1");
    assert_eq!(actual, outcome);
    assert!(auto);
}

#[test]
fn full_allows_every_kind_with_allow_once() {
    for kind in ["read", "edit", "delete", "execute", "other"] {
        let decision = auto_decide(&ToolSelector::Full, &request(kind, "Do a thing", all_options()));
        assert_eq!(decision.selected_option_id.as_deref(), Some("allow-once"));
        assert_resolved(&decision.resolved, "selected:allow_once");
    }
}

#[test]
fn full_falls_back_to_allow_always() {
    let decision = auto_decide(
        &ToolSelector::Full,
        &request(
            "edit",
            "Edit note",
            json!([{ "optionId": "allow-always", "name": "Always", "kind": "allow_always" }]),
        ),
    );

    assert_eq!(decision.selected_option_id.as_deref(), Some("allow-always"));
    assert_resolved(&decision.resolved, "selected:allow_always");
}

#[test]
fn read_only_allows_read_shaped_kinds() {
    for kind in ["read", "search", "think", "fetch"] {
        let decision = auto_decide(
            &ToolSelector::ReadOnly,
            &request(kind, "Look at a thing", all_options()),
        );
        assert_eq!(decision.selected_option_id.as_deref(), Some("allow-once"));
        assert_resolved(&decision.resolved, "selected:allow_once");
    }
}

#[test]
fn read_only_rejects_writing_kinds() {
    for kind in ["edit", "delete", "move", "execute"] {
        let decision = auto_decide(
            &ToolSelector::ReadOnly,
            &request(kind, "Change a thing", all_options()),
        );
        assert_eq!(decision.selected_option_id.as_deref(), Some("reject-once"));
        assert_resolved(&decision.resolved, "selected:reject_once");
    }
}

#[test]
fn only_allows_a_named_carbide_mcp_tool_whatever_its_kind() {
    let selector = ToolSelector::Only {
        names: vec!["notes_write".to_string()],
    };

    let allowed = auto_decide(
        &selector,
        &request("edit", "mcp__carbide__notes_write", all_options()),
    );
    assert_eq!(allowed.selected_option_id.as_deref(), Some("allow-once"));
    assert_resolved(&allowed.resolved, "selected:allow_once");

    let rejected = auto_decide(
        &selector,
        &request("edit", "mcp__carbide__notes_delete", all_options()),
    );
    assert_eq!(rejected.selected_option_id.as_deref(), Some("reject-once"));
    assert_resolved(&rejected.resolved, "selected:reject_once");
}

#[test]
fn only_rejects_a_non_mcp_tool_that_is_not_read_shaped() {
    let decision = auto_decide(
        &ToolSelector::Only {
            names: vec!["notes_write".to_string()],
        },
        &request("execute", "Bash", all_options()),
    );

    assert_eq!(decision.selected_option_id.as_deref(), Some("reject-once"));
    assert_resolved(&decision.resolved, "selected:reject_once");
}

#[test]
fn a_rejection_with_no_reject_option_signals_cancel() {
    let decision = auto_decide(
        &ToolSelector::ReadOnly,
        &request(
            "execute",
            "Bash",
            json!([{ "optionId": "allow-once", "name": "Allow", "kind": "allow_once" }]),
        ),
    );

    assert!(decision.selected_option_id.is_none());
    assert_resolved(&decision.resolved, "cancelled");
}

#[test]
fn an_approval_with_no_allow_option_signals_cancel() {
    let decision = auto_decide(
        &ToolSelector::Full,
        &request(
            "edit",
            "Edit note",
            json!([{ "optionId": "reject-once", "name": "Reject", "kind": "reject_once" }]),
        ),
    );

    assert!(decision.selected_option_id.is_none());
    assert_resolved(&decision.resolved, "cancelled");
}

#[test]
fn a_kindless_tool_call_falls_back_to_name_inference() {
    let decision = auto_decide(
        &ToolSelector::ReadOnly,
        &request("other", "read_note", all_options()),
    );

    assert_eq!(decision.selected_option_id.as_deref(), Some("allow-once"));
    assert_resolved(&decision.resolved, "selected:allow_once");
}
