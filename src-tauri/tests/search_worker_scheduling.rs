use crate::features::search::service::{
    classify_embed_request, command_kind, drain_action, sync_paths_drain_action,
    terminal_embed_event, DbCommand, DbCommandKind, DrainAction, EmbedRequest,
    EmbeddingProgressEvent,
};
use std::sync::mpsc::{channel, sync_channel, SyncSender};

#[test]
fn an_idle_worker_enqueues_the_request() {
    assert_eq!(classify_embed_request(false, false), EmbedRequest::Enqueue);
}

/// A queued pass has not taken its work snapshot yet, so it will discover
/// whatever this request is about when it runs.
#[test]
fn a_queued_pass_absorbs_further_requests() {
    assert_eq!(classify_embed_request(false, true), EmbedRequest::Skip);
    assert_eq!(classify_embed_request(true, true), EmbedRequest::Skip);
}

/// The defect this lane fixes: an index sync chases itself with `embed_sync`
/// while the previous pass is still on the writer thread. That request used to
/// be dropped, and the sections it was about stayed unembedded until the vault
/// was reopened.
#[test]
fn a_request_during_a_running_pass_rearms_it() {
    assert_eq!(classify_embed_request(true, false), EmbedRequest::Rearm);
}

#[test]
fn a_save_drained_mid_scan_does_not_restart_the_scan() {
    assert_eq!(
        drain_action(DbCommandKind::ContentUpsert),
        DrainAction::Apply
    );
}

#[test]
fn a_structural_mutation_drained_mid_scan_restarts_the_scan() {
    assert_eq!(
        drain_action(DbCommandKind::StructuralMutation),
        DrainAction::ApplyAndResync
    );
}

#[test]
fn pipeline_commands_drained_mid_scan_are_deferred() {
    assert_eq!(drain_action(DbCommandKind::Reentrant), DrainAction::Defer);
    assert_eq!(drain_action(DbCommandKind::Shutdown), DrainAction::Defer);
}

/// The contract documented on `drain_pending_commands`: a save made mid-pass is
/// not delayed by the rest of the vault. `handle_sync_paths` used to defer every
/// drained command, so a save landing during a path sync waited for the whole
/// pass.
#[test]
fn a_save_drained_mid_path_sync_is_applied_immediately() {
    assert_eq!(
        sync_paths_drain_action(DbCommandKind::ContentUpsert),
        DrainAction::Apply
    );
}

#[test]
fn pipeline_commands_drained_mid_path_sync_are_deferred() {
    assert_eq!(
        sync_paths_drain_action(DbCommandKind::Reentrant),
        DrainAction::Defer
    );
    assert_eq!(
        sync_paths_drain_action(DbCommandKind::Shutdown),
        DrainAction::Defer
    );
}

/// A path sync indexes a caller-supplied list, so a rename applied mid-pass
/// would leave it indexing paths that no longer exist. Unlike `run_index_op`,
/// which resyncs, this path keeps deferring structural mutations — the
/// duplicated first assertion is the contrast the name promises.
#[test]
fn a_structural_mutation_drained_mid_path_sync_defers_where_a_scan_would_resync() {
    assert_eq!(
        drain_action(DbCommandKind::StructuralMutation),
        DrainAction::ApplyAndResync
    );
    assert_eq!(
        sync_paths_drain_action(DbCommandKind::StructuralMutation),
        DrainAction::Defer
    );
}

fn reply<T>() -> SyncSender<Result<T, String>> {
    sync_channel(1).0
}

/// The tests above hand `drain_action` a `DbCommandKind` directly, so nothing
/// covered `command_kind` — the half of the fold that decides which kind a real
/// command *is*. A variant filed under the wrong arm would pass every one of
/// them. These feed the real `DbCommand`s the writer channel carries.
///
/// The seven variants holding an `AppHandle` are absent because that type is
/// `AppHandle<Wry>` and cannot be built off a real event loop; `ContentUpsert`
/// is reachable only through two of them and so stays uncovered here.
#[test]
fn real_commands_map_to_the_action_the_drain_loop_takes() {
    let cases: Vec<(DbCommand, DbCommandKind, DrainAction, DrainAction)> = vec![
        (
            DbCommand::Shutdown,
            DbCommandKind::Shutdown,
            DrainAction::Defer,
            DrainAction::Defer,
        ),
        (
            DbCommand::RebuildIndex,
            DbCommandKind::Reentrant,
            DrainAction::Defer,
            DrainAction::Defer,
        ),
        (
            DbCommand::RemoveNote {
                note_id: "note-a".into(),
                reply: reply(),
            },
            DbCommandKind::StructuralMutation,
            DrainAction::ApplyAndResync,
            DrainAction::Defer,
        ),
        (
            DbCommand::RemoveNotesByPrefix {
                prefix: "folder/".into(),
                reply: reply(),
            },
            DbCommandKind::StructuralMutation,
            DrainAction::ApplyAndResync,
            DrainAction::Defer,
        ),
        (
            DbCommand::RenamePath {
                old_path: "a.md".into(),
                new_path: "b.md".into(),
                reply: reply(),
            },
            DbCommandKind::StructuralMutation,
            DrainAction::ApplyAndResync,
            DrainAction::Defer,
        ),
    ];

    for (cmd, kind, scan_action, path_sync_action) in cases {
        let actual = command_kind(&cmd);
        assert_eq!(actual, kind, "command_kind disagreed for {kind:?}");
        assert_eq!(
            drain_action(actual),
            scan_action,
            "run_index_op would take the wrong action for {kind:?}"
        );
        assert_eq!(
            sync_paths_drain_action(actual),
            path_sync_action,
            "handle_sync_paths would take the wrong action for {kind:?}"
        );
    }
}

/// Drains a real `Receiver<DbCommand>` the way both drain loops do — `try_recv`
/// until empty, folding each command through `drain_action(command_kind(..))` —
/// and asserts the partition. A shutdown arriving mid-scan must land in the
/// deferred pile rather than being applied, which is what keeps the writer from
/// tearing itself down inside an index pass.
#[test]
fn draining_a_real_channel_defers_shutdown_and_applies_structural_mutations() {
    let (tx, rx) = channel::<DbCommand>();
    tx.send(DbCommand::RemoveNote {
        note_id: "note-a".into(),
        reply: reply(),
    })
    .unwrap();
    tx.send(DbCommand::Shutdown).unwrap();
    tx.send(DbCommand::RebuildIndex).unwrap();

    let mut applied = Vec::new();
    let mut deferred = Vec::new();
    let mut resyncs = 0;
    while let Ok(cmd) = rx.try_recv() {
        match drain_action(command_kind(&cmd)) {
            DrainAction::Defer => deferred.push(cmd),
            DrainAction::Apply => applied.push(cmd),
            DrainAction::ApplyAndResync => {
                resyncs += 1;
                applied.push(cmd);
            }
        }
    }

    assert_eq!(applied.len(), 1, "only the removal should have been applied");
    assert_eq!(resyncs, 1, "a removal invalidates the running scan's plan");
    assert_eq!(deferred.len(), 2, "shutdown and rebuild both defer");
    assert!(
        deferred.iter().any(|c| matches!(c, DbCommand::Shutdown)),
        "a shutdown drained mid-scan must be deferred, not applied"
    );
}

#[test]
fn a_finished_pass_reports_completed() {
    match terminal_embed_event(false, "vault-a", 7, 42) {
        Some(EmbeddingProgressEvent::Completed {
            vault_id,
            embedded,
            elapsed_ms,
        }) => {
            assert_eq!(vault_id, "vault-a");
            assert_eq!(embedded, 7);
            assert_eq!(elapsed_ms, 42);
        }
        _ => panic!("a finished pass owes its listeners a Completed"),
    }
}

/// A pass with nothing to do is still a finished pass. Returning early without
/// this event left the "Embedding sections" indicator spinning for the rest of
/// the session and never resolved `wait_for_embedding_run`.
#[test]
fn a_pass_with_no_work_still_reports_completed() {
    assert!(terminal_embed_event(false, "vault-a", 0, 0).is_some());
}

#[test]
fn a_cancelled_pass_reports_nothing() {
    assert!(terminal_embed_event(true, "vault-a", 3, 42).is_none());
}
