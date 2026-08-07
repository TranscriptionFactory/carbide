use std::path::Path;

use crate::features::ai::acp::permission_store::GrantStore;
use crate::features::ai::acp::permissions::{
    kind_name, Evaluation, ParkedDecision, PermissionEngine, PermissionRequestSpec,
};
use crate::features::ai::agent_stream::{PermissionOptionKind, ToolKind, ToolSelector};

const AGENT: &str = "claude-code";

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

#[test]
fn preset_matrix_covers_every_kind_in_safe_and_power() {
    let (_dir, engine) = temp_engine();

    // (kind, safe, power)
    let matrix = [
        (ToolKind::Read, Evaluation::Allow, Evaluation::Allow),
        (ToolKind::Search, Evaluation::Allow, Evaluation::Allow),
        (ToolKind::Think, Evaluation::Allow, Evaluation::Allow),
        (ToolKind::Fetch, Evaluation::Allow, Evaluation::Allow),
        (ToolKind::Edit, Evaluation::Prompt, Evaluation::Allow),
        (ToolKind::Move, Evaluation::Prompt, Evaluation::Allow),
        (ToolKind::Delete, Evaluation::Prompt, Evaluation::Prompt),
        (ToolKind::Execute, Evaluation::Prompt, Evaluation::Prompt),
        (ToolKind::Other, Evaluation::Prompt, Evaluation::Prompt),
        (ToolKind::SwitchMode, Evaluation::Allow, Evaluation::Allow),
    ];

    for (kind, safe, power) in matrix {
        let request = spec("SomeTool", kind, &["/vault/note.md"]);
        assert_eq!(
            engine.evaluate(&ToolSelector::ReadOnly, &request),
            safe,
            "safe mode decision for {kind:?}"
        );
        assert_eq!(
            engine.evaluate(&ToolSelector::Full, &request),
            power,
            "power mode decision for {kind:?}"
        );
    }
}

#[test]
fn only_selector_decides_like_safe_mode() {
    let (_dir, engine) = temp_engine();
    let only = ToolSelector::Only {
        names: vec!["read_note".to_string()],
    };

    let edit = spec("Edit", ToolKind::Edit, &["/vault/note.md"]);
    let read = spec("Read", ToolKind::Read, &["/vault/note.md"]);

    assert_eq!(engine.evaluate(&only, &edit), Evaluation::Prompt);
    assert_eq!(engine.evaluate(&only, &read), Evaluation::Allow);
}

#[test]
fn mutating_switch_mode_prompts_in_both_modes() {
    let (_dir, engine) = temp_engine();
    let mut request = spec("switch", ToolKind::SwitchMode, &[]);
    request.mutating = true;

    assert_eq!(
        engine.evaluate(&ToolSelector::ReadOnly, &request),
        Evaluation::Prompt
    );
    assert_eq!(
        engine.evaluate(&ToolSelector::Full, &request),
        Evaluation::Prompt
    );
}

#[test]
fn a_pre_authorized_call_is_allowed_even_for_destructive_kinds_in_safe_mode() {
    let (_dir, engine) = temp_engine();
    let mut request = spec(
        "mcp__carbide__delete_note",
        ToolKind::Delete,
        &["/vault/note.md"],
    );
    request.pre_authorized = true;

    assert_eq!(
        engine.evaluate(&ToolSelector::ReadOnly, &request),
        Evaluation::Allow
    );
}

#[test]
fn an_mcp_shaped_name_alone_does_not_bypass_the_preset() {
    let (_dir, engine) = temp_engine();
    // The prefix is a wire convention the request builder reads; a name that
    // merely looks like one must not buy a decision on its own.
    let request = spec(
        "mcp__carbide__delete_note",
        ToolKind::Delete,
        &["/vault/note.md"],
    );

    assert_eq!(
        engine.evaluate(&ToolSelector::ReadOnly, &request),
        Evaluation::Prompt
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
        engine.evaluate(&ToolSelector::ReadOnly, &request),
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
        engine.evaluate(&ToolSelector::ReadOnly, &inside),
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
        engine.evaluate(&ToolSelector::ReadOnly, &outside),
        Evaluation::Prompt
    );
    assert_eq!(
        engine.evaluate(&ToolSelector::ReadOnly, &sibling),
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
        engine.evaluate(&ToolSelector::Full, &request),
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

    // The grant is what makes the next identical call auto-allow in safe mode.
    let next = spec("Edit", ToolKind::Edit, &["/vault/notes/a.md"]);
    assert_eq!(
        engine.evaluate(&ToolSelector::ReadOnly, &next),
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
        engine.evaluate(&ToolSelector::Full, &spec("Bash", ToolKind::Execute, &[])),
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
