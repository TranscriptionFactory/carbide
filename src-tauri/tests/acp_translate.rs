use agent_client_protocol::schema::v1::SessionUpdate;
use serde_json::{json, Value};

use crate::features::ai::acp::TurnTranslator;
use crate::features::ai::agent_stream::{
    AgentEvent, ToolCallStatus, ToolContent, ToolKind, ToolLocation,
};
use crate::features::ai::harness::MutatingToolSet;
use crate::features::mcp::types::{InputSchema, ToolDefinition};

fn tool(name: &str, mutating: bool) -> ToolDefinition {
    ToolDefinition {
        name: name.to_string(),
        description: String::new(),
        mutating,
        input_schema: InputSchema {
            schema_type: "object".to_string(),
            properties: Default::default(),
            required: Vec::new(),
        },
    }
}

fn translator() -> TurnTranslator {
    TurnTranslator::new(MutatingToolSet::from_catalog(&[
        tool("notes_read", false),
        tool("notes_write", true),
    ]))
}

fn update(value: Value) -> SessionUpdate {
    serde_json::from_value(value).expect("fixture should deserialize as a SessionUpdate")
}

#[test]
fn message_chunk_becomes_text() {
    let events = translator().on_update(&update(json!({
        "sessionUpdate": "agent_message_chunk",
        "content": { "type": "text", "text": "hello" }
    })));

    assert_eq!(
        events,
        vec![AgentEvent::Text {
            delta: "hello".to_string()
        }]
    );
}

#[test]
fn thought_chunk_becomes_reasoning() {
    let events = translator().on_update(&update(json!({
        "sessionUpdate": "agent_thought_chunk",
        "content": { "type": "text", "text": "thinking" }
    })));

    assert_eq!(
        events,
        vec![AgentEvent::Reasoning {
            delta: "thinking".to_string()
        }]
    );
}

#[test]
fn tool_call_carries_kind_locations_and_input_paths() {
    let events = translator().on_update(&update(json!({
        "sessionUpdate": "tool_call",
        "toolCallId": "call-1",
        "title": "Read note",
        "kind": "read",
        "status": "pending",
        "locations": [{ "path": "/vault/a.md", "line": 12 }],
        "rawInput": { "file_path": "/vault/b.md" }
    })));

    let AgentEvent::ToolStart {
        id,
        name,
        kind,
        input_summary,
        paths,
        mutating,
        locations,
    } = events.into_iter().next().expect("a tool_start event")
    else {
        panic!("expected a tool_start event");
    };

    assert_eq!(id, "call-1");
    assert_eq!(name, "Read note");
    assert_eq!(kind, ToolKind::Read);
    assert!(input_summary.contains("/vault/b.md"));
    assert_eq!(paths, vec!["/vault/a.md", "/vault/b.md"]);
    assert!(!mutating);
    assert_eq!(
        locations,
        vec![ToolLocation {
            path: "/vault/a.md".to_string(),
            line: Some(12)
        }]
    );
}

#[test]
fn edit_kind_with_a_diff_is_mutating_and_lists_the_diff_path() {
    let events = translator().on_update(&update(json!({
        "sessionUpdate": "tool_call",
        "toolCallId": "call-2",
        "title": "Apply patch",
        "kind": "edit",
        "content": [{
            "type": "diff",
            "path": "/vault/note.md",
            "oldText": "old",
            "newText": "new"
        }]
    })));

    let AgentEvent::ToolStart {
        kind,
        paths,
        mutating,
        ..
    } = events.into_iter().next().expect("a tool_start event")
    else {
        panic!("expected a tool_start event");
    };

    assert_eq!(kind, ToolKind::Edit);
    assert!(mutating);
    assert_eq!(paths, vec!["/vault/note.md"]);
}

#[test]
fn mcp_catalog_marks_a_tool_mutating_without_a_kind() {
    let events = translator().on_update(&update(json!({
        "sessionUpdate": "tool_call",
        "toolCallId": "call-3",
        "title": "mcp__carbide__notes_write",
        "kind": "other"
    })));

    let AgentEvent::ToolStart { mutating, .. } =
        events.into_iter().next().expect("a tool_start event")
    else {
        panic!("expected a tool_start event");
    };

    assert!(mutating);
}

#[test]
fn tool_call_update_reports_diff_content() {
    let mut translator = translator();
    translator.on_update(&update(json!({
        "sessionUpdate": "tool_call",
        "toolCallId": "call-4",
        "title": "Apply patch",
        "kind": "edit"
    })));

    let events = translator.on_update(&update(json!({
        "sessionUpdate": "tool_call_update",
        "toolCallId": "call-4",
        "status": "in_progress",
        "content": [{
            "type": "diff",
            "path": "/vault/mid.md",
            "newText": "body"
        }]
    })));

    assert_eq!(
        events,
        vec![AgentEvent::ToolUpdate {
            id: "call-4".to_string(),
            status: ToolCallStatus::InProgress,
            content: vec![ToolContent::Diff {
                path: "/vault/mid.md".to_string(),
                old_text: None,
                new_text: "body".to_string(),
            }],
            paths: vec!["/vault/mid.md".to_string()],
        }]
    );
}

#[test]
fn completion_emits_tool_end_with_the_accumulated_union() {
    let mut translator = translator();
    translator.on_update(&update(json!({
        "sessionUpdate": "tool_call",
        "toolCallId": "call-5",
        "title": "Apply patch",
        "kind": "edit",
        "locations": [{ "path": "/vault/start.md" }]
    })));
    translator.on_update(&update(json!({
        "sessionUpdate": "tool_call_update",
        "toolCallId": "call-5",
        "status": "in_progress",
        "content": [{
            "type": "diff",
            "path": "/vault/mid.md",
            "newText": "body"
        }]
    })));

    let events = translator.on_update(&update(json!({
        "sessionUpdate": "tool_call_update",
        "toolCallId": "call-5",
        "status": "completed",
        "content": [{ "type": "content", "content": { "type": "text", "text": "wrote 2 files" } }]
    })));

    assert_eq!(events.len(), 2);
    let AgentEvent::ToolEnd {
        id,
        name,
        ok,
        result_summary,
        paths,
        mutating,
    } = events.into_iter().nth(1).expect("a tool_end event")
    else {
        panic!("expected a tool_end event");
    };

    assert_eq!(id, "call-5");
    assert_eq!(name, "Apply patch");
    assert!(ok);
    assert_eq!(result_summary.as_deref(), Some("wrote 2 files"));
    assert_eq!(paths, vec!["/vault/start.md", "/vault/mid.md"]);
    assert!(mutating);
}

#[test]
fn failed_update_ends_the_call_as_not_ok() {
    let mut translator = translator();
    translator.on_update(&update(json!({
        "sessionUpdate": "tool_call",
        "toolCallId": "call-6",
        "title": "Run tests",
        "kind": "execute"
    })));

    let events = translator.on_update(&update(json!({
        "sessionUpdate": "tool_call_update",
        "toolCallId": "call-6",
        "status": "failed",
        "content": [{ "type": "content", "content": { "type": "text", "text": "exit code 1" } }]
    })));

    let AgentEvent::ToolEnd {
        ok,
        result_summary,
        mutating,
        ..
    } = events.into_iter().nth(1).expect("a tool_end event")
    else {
        panic!("expected a tool_end event");
    };

    assert!(!ok);
    assert_eq!(result_summary.as_deref(), Some("exit code 1"));
    assert!(!mutating);
}

#[test]
fn result_summary_is_capped() {
    let mut translator = translator();
    let long = "x".repeat(500);
    translator.on_update(&update(json!({
        "sessionUpdate": "tool_call",
        "toolCallId": "call-7",
        "title": "Read note",
        "kind": "read"
    })));

    let events = translator.on_update(&update(json!({
        "sessionUpdate": "tool_call_update",
        "toolCallId": "call-7",
        "status": "completed",
        "content": [{ "type": "content", "content": { "type": "text", "text": long } }]
    })));

    let AgentEvent::ToolEnd { result_summary, .. } =
        events.into_iter().nth(1).expect("a tool_end event")
    else {
        panic!("expected a tool_end event");
    };

    assert_eq!(result_summary.expect("a summary").chars().count(), 200);
}

#[test]
fn plan_and_mode_updates_are_ignored() {
    let mut translator = translator();

    assert!(translator
        .on_update(&update(json!({
            "sessionUpdate": "plan",
            "entries": [{ "content": "step one", "priority": "high", "status": "pending" }]
        })))
        .is_empty());
    assert!(translator
        .on_update(&update(json!({
            "sessionUpdate": "current_mode_update",
            "currentModeId": "default"
        })))
        .is_empty());
    assert!(translator
        .on_update(&update(json!({
            "sessionUpdate": "available_commands_update",
            "availableCommands": []
        })))
        .is_empty());
}
