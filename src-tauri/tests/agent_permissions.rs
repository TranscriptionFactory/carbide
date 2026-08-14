use std::path::Path;

use crate::features::ai::permission_store::GrantStore;
use crate::features::ai::permissions::{
    kind_name, select_allow, Evaluation, ParkedDecision, PermissionEngine, PermissionRequestSpec,
    SessionPolicy,
};
use crate::features::ai::agent_stream::{
    PermissionOptionKind, PermissionOptionSpec, ToolKind,
};

const AGENT: &str = "claude-code";

fn off() -> SessionPolicy {
    SessionPolicy::default()
}

fn on() -> SessionPolicy {
    let policy = SessionPolicy::default();
    policy.set_auto_approve(true);
    policy
}

fn allow_options() -> Vec<PermissionOptionSpec> {
    vec![
        PermissionOptionSpec {
            option_id: "reject".to_string(),
            label: "Deny".to_string(),
            kind: PermissionOptionKind::RejectOnce,
        },
        PermissionOptionSpec {
            option_id: "allow-once".to_string(),
            label: "Allow".to_string(),
            kind: PermissionOptionKind::AllowOnce,
        },
    ]
}

fn spec(name: &str, kind: ToolKind, paths: &[&str]) -> PermissionRequestSpec {
    PermissionRequestSpec {
        agent_id: AGENT.to_string(),
        tool_call_id: Some("call-1".to_string()),
        name: name.to_string(),
        kind,
        input_summary: "summary".to_string(),
        paths: paths.iter().map(|p| p.to_string()).collect(),
        mutating: matches!(
            kind,
            ToolKind::Edit | ToolKind::Delete | ToolKind::Move | ToolKind::Execute
        ),
        pre_authorized: false,
        options: Vec::new(),
    }
}

fn engine(dir: &Path) -> PermissionEngine {
    PermissionEngine::new(dir)
}

fn temp_engine() -> (tempfile::TempDir, PermissionEngine) {
    let dir = tempfile::tempdir().unwrap();
    let engine = engine(dir.path());
    (dir, engine)
}

// --- preset matrix -------------------------------------------------------

// S8 / S9 / S18: the whole decision surface, both ways round.
#[test]
fn preset_matrix_covers_every_kind_with_auto_approve_off_and_on() {
    let (_dir, engine) = temp_engine();

    // (kind, auto_approve off, auto_approve on)
    let matrix = [
        (ToolKind::Read, Evaluation::Allow, Evaluation::Allow),
        (ToolKind::Search, Evaluation::Allow, Evaluation::Allow),
        (ToolKind::Think, Evaluation::Allow, Evaluation::Allow),
        (ToolKind::Fetch, Evaluation::Allow, Evaluation::Allow),
        (ToolKind::Edit, Evaluation::Prompt, Evaluation::Allow),
        (ToolKind::Move, Evaluation::Prompt, Evaluation::Allow),
        // O2: auto-approve covers the destructive kinds too. Carving Delete
        // out would not be a floor while Execute is allowed.
        (ToolKind::Delete, Evaluation::Prompt, Evaluation::Allow),
        (ToolKind::Execute, Evaluation::Prompt, Evaluation::Allow),
        (ToolKind::Other, Evaluation::Prompt, Evaluation::Allow),
        (ToolKind::SwitchMode, Evaluation::Allow, Evaluation::Allow),
    ];

    for (kind, closed, open) in matrix {
        let request = spec("SomeTool", kind, &["/vault/note.md"]);
        assert_eq!(
            engine.evaluate(&off(), &request),
            closed,
            "auto_approve off decision for {kind:?}"
        );
        assert_eq!(
            engine.evaluate(&on(), &request),
            open,
            "auto_approve on decision for {kind:?}"
        );
    }
}

// S12: the cell is read per call, not snapshotted, so one engine and one
// policy answer differently either side of a flip.
#[test]
fn a_flip_changes_the_answer_for_the_very_next_call() {
    let (_dir, engine) = temp_engine();
    let policy = off();
    let edit = spec("Edit", ToolKind::Edit, &["/vault/note.md"]);

    assert_eq!(engine.evaluate(&policy, &edit), Evaluation::Prompt);
    policy.set_auto_approve(true);
    assert_eq!(engine.evaluate(&policy, &edit), Evaluation::Allow);
    policy.set_auto_approve(false);
    assert_eq!(engine.evaluate(&policy, &edit), Evaluation::Prompt);
}

#[test]
fn mutating_switch_mode_prompts_only_while_auto_approve_is_off() {
    let (_dir, engine) = temp_engine();
    let mut request = spec("switch", ToolKind::SwitchMode, &[]);
    request.mutating = true;

    assert_eq!(engine.evaluate(&off(), &request), Evaluation::Prompt);
    assert_eq!(engine.evaluate(&on(), &request), Evaluation::Allow);
}

#[test]
fn a_pre_authorized_call_is_allowed_even_for_destructive_kinds() {
    let (_dir, engine) = temp_engine();
    let mut request = spec(
        "mcp__carbide__delete_note",
        ToolKind::Delete,
        &["/vault/note.md"],
    );
    request.pre_authorized = true;

    assert_eq!(engine.evaluate(&off(), &request), Evaluation::Allow);
}

#[test]
fn an_mcp_shaped_name_alone_does_not_bypass_the_preset() {
    let (_dir, engine) = temp_engine();
    // Carbide's own MCP tools are no longer exempt: they are advertised in
    // full and gated here like anything else.
    let request = spec(
        "mcp__carbide__delete_note",
        ToolKind::Delete,
        &["/vault/note.md"],
    );

    assert_eq!(engine.evaluate(&off(), &request), Evaluation::Prompt);
}

// --- session policy ------------------------------------------------------

#[test]
fn a_ticket_is_single_use() {
    let policy = off();
    policy.grant_ticket("note_write");

    assert!(policy.consume_ticket("note_write"));
    assert!(!policy.consume_ticket("note_write"));
}

#[test]
fn a_ticket_does_not_answer_for_a_different_tool() {
    let policy = off();
    policy.grant_ticket("note_write");

    assert!(!policy.consume_ticket("delete_note"));
    assert!(policy.consume_ticket("note_write"));
}

#[test]
fn unconsumed_tickets_do_not_grow_without_bound() {
    let policy = off();
    for index in 0..100 {
        policy.grant_ticket(&format!("tool_{index}"));
    }

    // The oldest are dropped, so an agent that asks and never calls cannot
    // accumulate approvals forever.
    assert!(!policy.consume_ticket("tool_0"));
    assert!(policy.consume_ticket("tool_99"));
}

#[test]
fn taking_the_parked_list_empties_it_so_a_second_flip_answers_nothing() {
    let policy = off();
    policy.park("perm-1".to_string());
    policy.park("perm-2".to_string());

    assert_eq!(policy.take_parked().len(), 2);
    assert!(policy.take_parked().is_empty());
}

#[test]
fn unparking_removes_only_the_named_request() {
    let policy = off();
    policy.park("perm-1".to_string());
    policy.park("perm-2".to_string());

    policy.unpark("perm-1");

    assert_eq!(policy.take_parked(), vec!["perm-2".to_string()]);
}

#[test]
fn the_always_on_policy_allows_what_a_default_one_prompts_for() {
    let (_dir, engine) = temp_engine();
    let request = spec("Bash", ToolKind::Execute, &[]);

    assert_eq!(
        engine.evaluate(&SessionPolicy::always_on(), &request),
        Evaluation::Allow
    );
}

// --- stored grants -------------------------------------------------------

#[test]
fn exact_tool_grant_allows_a_prompting_kind() {
    let dir = tempfile::tempdir().unwrap();
    {
        let mut store = GrantStore::load(dir.path());
        store
            .add_grant(
                AGENT.to_string(),
                "Bash".to_string(),
                kind_name(ToolKind::Execute).to_string(),
                None,
            )
            .unwrap();
    }

    let engine = engine(dir.path());
    let request = spec("Bash", ToolKind::Execute, &["/vault/note.md"]);

    assert_eq!(
        engine.evaluate(&off(), &request),
        Evaluation::Allow
    );
}

#[test]
fn kind_grant_allows_a_different_tool_under_its_path_prefix() {
    let dir = tempfile::tempdir().unwrap();
    {
        let mut store = GrantStore::load(dir.path());
        store
            .add_grant(
                AGENT.to_string(),
                "Write".to_string(),
                kind_name(ToolKind::Edit).to_string(),
                Some("/vault/notes".to_string()),
            )
            .unwrap();
    }

    let engine = engine(dir.path());
    let inside = spec("Edit", ToolKind::Edit, &["/vault/notes/daily.md"]);

    assert_eq!(
        engine.evaluate(&off(), &inside),
        Evaluation::Allow
    );
}

#[test]
fn kind_grant_does_not_leak_outside_its_path_prefix() {
    let dir = tempfile::tempdir().unwrap();
    {
        let mut store = GrantStore::load(dir.path());
        store
            .add_grant(
                AGENT.to_string(),
                "Write".to_string(),
                kind_name(ToolKind::Edit).to_string(),
                Some("/vault/notes".to_string()),
            )
            .unwrap();
    }

    let engine = engine(dir.path());
    let outside = spec("Edit", ToolKind::Edit, &["/vault/archive/old.md"]);
    // A sibling directory sharing the prefix as a string must not match either.
    let sibling = spec("Edit", ToolKind::Edit, &["/vault/notes-backup/old.md"]);

    assert_eq!(
        engine.evaluate(&off(), &outside),
        Evaluation::Prompt
    );
    assert_eq!(
        engine.evaluate(&off(), &sibling),
        Evaluation::Prompt
    );
}

#[test]
fn grants_are_scoped_to_the_agent_that_earned_them() {
    let dir = tempfile::tempdir().unwrap();
    {
        let mut store = GrantStore::load(dir.path());
        store
            .add_grant(
                AGENT.to_string(),
                "Bash".to_string(),
                kind_name(ToolKind::Execute).to_string(),
                None,
            )
            .unwrap();
    }

    let engine = engine(dir.path());
    let mut request = spec("Bash", ToolKind::Execute, &[]);
    request.agent_id = "gemini".to_string();

    assert_eq!(
        engine.evaluate(&off(), &request),
        Evaluation::Prompt
    );
}

// --- parking -------------------------------------------------------------

#[tokio::test]
async fn park_and_resolve_round_trip() {
    let (_dir, engine) = temp_engine();
    let request = spec("Bash", ToolKind::Execute, &["/vault/note.md"]);

    let receiver = engine.park("perm-1".to_string(), request);
    assert!(engine.resolve("perm-1", "allow-once", PermissionOptionKind::AllowOnce));

    assert_eq!(
        receiver.await.unwrap(),
        ParkedDecision::Selected {
            option_id: "allow-once".to_string(),
            kind: PermissionOptionKind::AllowOnce,
            auto: false,
        }
    );
}

#[tokio::test]
async fn resolve_is_false_for_an_unknown_request() {
    let (_dir, engine) = temp_engine();

    assert!(!engine.resolve("perm-missing", "allow-once", PermissionOptionKind::AllowOnce));
}

#[tokio::test]
async fn resolving_twice_only_answers_once() {
    let (_dir, engine) = temp_engine();
    let _receiver = engine.park(
        "perm-1".to_string(),
        spec("Bash", ToolKind::Execute, &["/vault/note.md"]),
    );

    assert!(engine.resolve("perm-1", "allow-once", PermissionOptionKind::AllowOnce));
    assert!(!engine.resolve("perm-1", "allow-once", PermissionOptionKind::AllowOnce));
}

#[tokio::test]
async fn cancel_unblocks_only_the_named_request() {
    let (_dir, engine) = temp_engine();
    let first = engine.park(
        "perm-1".to_string(),
        spec("Bash", ToolKind::Execute, &["/vault/a.md"]),
    );
    let second = engine.park(
        "perm-2".to_string(),
        spec("Edit", ToolKind::Edit, &["/vault/b.md"]),
    );

    assert!(engine.cancel("perm-1"));

    assert_eq!(first.await.unwrap(), ParkedDecision::Cancelled);
    assert!(!engine.resolve("perm-1", "allow-once", PermissionOptionKind::AllowOnce));
    // Cancelling one session's prompt leaves every other session's alone.
    assert!(engine.resolve("perm-2", "allow-once", PermissionOptionKind::AllowOnce));
    assert_eq!(
        second.await.unwrap(),
        ParkedDecision::Selected {
            option_id: "allow-once".to_string(),
            kind: PermissionOptionKind::AllowOnce,
            auto: false,
        }
    );
}

#[tokio::test]
async fn dropping_the_wait_releases_the_parked_entry() {
    let dir = tempfile::tempdir().unwrap();
    let engine = std::sync::Arc::new(engine(dir.path()));

    {
        let waiting =
            engine.await_decision("perm-1".to_string(), spec("Bash", ToolKind::Execute, &[]));
        futures_util::pin_mut!(waiting);
        // One poll parks the request; the drop below stands in for a session
        // teardown abandoning the prompt mid-flight.
        assert!(futures_util::poll!(waiting.as_mut()).is_pending());
    }

    assert!(
        !engine.resolve("perm-1", "allow-once", PermissionOptionKind::AllowOnce),
        "an abandoned wait must not strand its entry in the pending map"
    );
}

// --- flipping auto-approve onto a parked prompt (S4) ----------------------

#[tokio::test]
async fn resolve_auto_answers_a_parked_prompt_with_the_mildest_allow() {
    let (_dir, engine) = temp_engine();
    let mut request = spec("Edit", ToolKind::Edit, &["/vault/note.md"]);
    request.options = allow_options();

    let receiver = engine.park("perm-1".to_string(), request);
    let resolved = engine.resolve_auto("perm-1").expect("the request was parked");

    assert_eq!(resolved.name, "Edit");
    assert_eq!(
        receiver.await.unwrap(),
        ParkedDecision::Selected {
            option_id: "allow-once".to_string(),
            kind: PermissionOptionKind::AllowOnce,
            // The transcript must say the flip answered this, not the user.
            auto: true,
        }
    );
}

#[tokio::test]
async fn resolve_auto_persists_no_grant() {
    let (_dir, engine) = temp_engine();
    let mut request = spec("Edit", ToolKind::Edit, &["/vault/notes/a.md"]);
    request.options = vec![PermissionOptionSpec {
        option_id: "allow-always".to_string(),
        label: "Always allow".to_string(),
        kind: PermissionOptionKind::AllowAlways,
    }];

    let receiver = engine.park("perm-1".to_string(), request);
    assert!(engine.resolve_auto("perm-1").is_some());
    let _ = receiver.await;

    // A session-scoped flip must not leave a grant that outlives the session.
    assert!(engine.grants().is_empty());
}

#[tokio::test]
async fn resolve_auto_cancels_a_prompt_with_no_allow_on_offer() {
    let (_dir, engine) = temp_engine();
    let mut request = spec("Edit", ToolKind::Edit, &["/vault/note.md"]);
    request.options = vec![PermissionOptionSpec {
        option_id: "reject".to_string(),
        label: "Deny".to_string(),
        kind: PermissionOptionKind::RejectOnce,
    }];

    let receiver = engine.park("perm-1".to_string(), request);
    assert!(engine.resolve_auto("perm-1").is_some());

    assert_eq!(receiver.await.unwrap(), ParkedDecision::Cancelled);
}

#[tokio::test]
async fn resolve_auto_is_none_for_an_unknown_request() {
    let (_dir, engine) = temp_engine();

    assert!(engine.resolve_auto("perm-missing").is_none());
}

#[test]
fn select_allow_prefers_allow_once_over_allow_always() {
    let options = vec![
        PermissionOptionSpec {
            option_id: "always".to_string(),
            label: "Always".to_string(),
            kind: PermissionOptionKind::AllowAlways,
        },
        PermissionOptionSpec {
            option_id: "once".to_string(),
            label: "Once".to_string(),
            kind: PermissionOptionKind::AllowOnce,
        },
    ];

    assert_eq!(select_allow(&options).unwrap().option_id, "once");
}

// --- recording choices ---------------------------------------------------

#[tokio::test]
async fn allow_always_persists_a_grant_scoped_to_the_common_directory() {
    let dir = tempfile::tempdir().unwrap();
    let engine = engine(dir.path());
    let receiver = engine.park(
        "perm-1".to_string(),
        spec(
            "Edit",
            ToolKind::Edit,
            &["/vault/notes/a.md", "/vault/notes/deep/b.md"],
        ),
    );

    assert!(engine.resolve("perm-1", "allow-always", PermissionOptionKind::AllowAlways));
    let _ = receiver.await;

    let grants = engine.grants();
    assert_eq!(grants.len(), 1);
    assert_eq!(grants[0].tool_name, "Edit");
    assert_eq!(grants[0].kind, "edit");
    assert_eq!(grants[0].path_prefix.as_deref(), Some("/vault/notes"));
    assert!(grants[0].granted_at > 0);

    // S10: the grant is what makes the next identical call auto-allow even
    // with auto-approve off.
    let next = spec("Edit", ToolKind::Edit, &["/vault/notes/a.md"]);
    assert_eq!(
        engine.evaluate(&off(), &next),
        Evaluation::Allow
    );
}

#[tokio::test]
async fn allow_once_and_rejections_persist_nothing() {
    let (_dir, engine) = temp_engine();

    for kind in [
        PermissionOptionKind::AllowOnce,
        PermissionOptionKind::RejectOnce,
        PermissionOptionKind::RejectAlways,
    ] {
        let receiver = engine.park(
            "perm-1".to_string(),
            spec("Edit", ToolKind::Edit, &["/vault/notes/a.md"]),
        );
        assert!(engine.resolve("perm-1", "option", kind));
        let _ = receiver.await;
    }

    assert!(engine.grants().is_empty());
}

#[test]
fn a_pathless_call_records_an_unscoped_grant() {
    let (_dir, engine) = temp_engine();

    engine.record_choice(
        &spec("Bash", ToolKind::Execute, &[]),
        PermissionOptionKind::AllowAlways,
    );

    let grants = engine.grants();
    assert_eq!(grants.len(), 1);
    assert_eq!(grants[0].path_prefix, None);
}

#[test]
fn engine_revoke_removes_a_grant_and_restores_prompting() {
    let (_dir, engine) = temp_engine();
    engine.record_choice(
        &spec("Bash", ToolKind::Execute, &[]),
        PermissionOptionKind::AllowAlways,
    );

    let id = engine.grants()[0].id.clone();
    engine.revoke(&id).unwrap();

    assert!(engine.grants().is_empty());
    assert_eq!(
        engine.evaluate(&off(), &spec("Bash", ToolKind::Execute, &[])),
        Evaluation::Prompt
    );
}

// --- store ---------------------------------------------------------------

fn store_path(dir: &Path) -> std::path::PathBuf {
    dir.join("acp-permissions.json")
}

#[test]
fn store_round_trips_through_disk() {
    let dir = tempfile::tempdir().unwrap();
    {
        let mut store = GrantStore::load(dir.path());
        store
            .add_grant(
                AGENT.to_string(),
                "Edit".to_string(),
                "edit".to_string(),
                Some("/vault/notes".to_string()),
            )
            .unwrap();
    }

    let store = GrantStore::load(dir.path());
    assert_eq!(store.grants().len(), 1);
    assert!(store.has_grant(
        AGENT,
        "Other",
        "edit",
        &["/vault/notes/a.md".to_string()]
    ));
    assert!(!store.has_grant(AGENT, "Other", "edit", &["/elsewhere/a.md".to_string()]));
}

#[test]
fn re_granting_the_same_scope_does_not_duplicate() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = GrantStore::load(dir.path());

    for _ in 0..2 {
        store
            .add_grant(AGENT.to_string(), "Edit".to_string(), "edit".to_string(), None)
            .unwrap();
    }

    assert_eq!(store.grants().len(), 1);
}

#[test]
fn a_corrupt_store_loads_empty() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(store_path(dir.path()), "{not json").unwrap();

    assert!(GrantStore::load(dir.path()).grants().is_empty());
}

#[test]
fn an_unsupported_version_loads_empty_and_leaves_the_file_alone() {
    let dir = tempfile::tempdir().unwrap();
    let raw = r#"{"version":2,"grants":[{"agent_id":"claude-code","tool_name":"Edit","kind":"edit","path_prefix":null,"granted_at":1}]}"#;
    std::fs::write(store_path(dir.path()), raw).unwrap();

    let store = GrantStore::load(dir.path());

    assert!(store.grants().is_empty());
    assert_eq!(
        std::fs::read_to_string(store_path(dir.path())).unwrap(),
        raw,
        "loading must never rewrite a store it does not understand"
    );
}

#[test]
fn writing_a_grant_leaves_valid_version_1_json_and_no_temp_file() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = GrantStore::load(dir.path());
    store
        .add_grant(AGENT.to_string(), "Edit".to_string(), "edit".to_string(), None)
        .unwrap();

    let raw = std::fs::read_to_string(store_path(dir.path())).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();

    assert_eq!(parsed["version"], 1);
    assert_eq!(parsed["grants"][0]["tool_name"], "Edit");
    assert!(!dir.path().join("acp-permissions.json.tmp").exists());
}

#[test]
fn store_revoke_removes_the_matching_grant_on_disk() {
    let dir = tempfile::tempdir().unwrap();
    {
        let mut store = GrantStore::load(dir.path());
        store
            .add_grant(AGENT.to_string(), "Edit".to_string(), "edit".to_string(), None)
            .unwrap();
        store
            .add_grant(AGENT.to_string(), "Bash".to_string(), "execute".to_string(), None)
            .unwrap();
        let edit_id = store
            .grants()
            .into_iter()
            .find(|grant| grant.tool_name == "Edit")
            .expect("the Edit grant was just written")
            .id;
        store.revoke(&edit_id).unwrap();
    }

    let store = GrantStore::load(dir.path());
    let grants = store.grants();
    assert_eq!(grants.len(), 1);
    assert_eq!(grants[0].tool_name, "Bash");
}

#[test]
fn revoking_something_unknown_is_a_no_op() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = GrantStore::load(dir.path());

    store.revoke("no-such-grant").unwrap();

    assert!(!store_path(dir.path()).exists());
}
