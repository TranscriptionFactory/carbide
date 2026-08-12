use crate::features::search::service::{
    classify_embed_request, drain_action, terminal_embed_event, DbCommandKind, DrainAction,
    EmbedRequest, EmbeddingProgressEvent,
};

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
