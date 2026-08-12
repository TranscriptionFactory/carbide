use crate::shared::constants;
use crate::shared::storage;
use crate::shared::vault_ignore;
use notify::event::{CreateKind, ModifyKind, RemoveKind, RenameMode};
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use specta::Type;
use std::collections::HashMap;
use std::path::Path;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct WatcherState {
    inner: Arc<Mutex<Option<WatcherRuntime>>>,
    current_vault_id: Arc<Mutex<Option<String>>>,
}

impl WatcherState {
    pub fn shutdown(&self) {
        if let Ok(mut current) = self.current_vault_id.lock() {
            *current = None;
        }
        if let Ok(mut guard) = self.inner.lock() {
            if let Some(runtime) = guard.take() {
                log::info!("Stopping file watcher");
                stop_runtime(runtime);
            }
        }
    }
}

struct WatcherRuntime {
    stop_tx: mpsc::Sender<()>,
    join_handle: Option<std::thread::JoinHandle<()>>,
}

#[derive(Debug, Serialize, Clone, Type)]
#[serde(tag = "type", rename_all = "snake_case")]
enum VaultFsEvent {
    // mtime_ms lets the frontend recognise the echo of Carbide's own write by
    // content identity instead of by counting events: one write can surface as
    // several Modify deliveries, but they all report the mtime Carbide wrote.
    // None whenever the file could not be stat'd (already deleted, races).
    NoteChangedExternally {
        vault_id: String,
        note_path: String,
        mtime_ms: Option<i64>,
    },
    NoteAdded {
        vault_id: String,
        note_path: String,
    },
    NoteRemoved {
        vault_id: String,
        note_path: String,
    },
    AssetChanged {
        vault_id: String,
        asset_path: String,
    },
    FolderCreated {
        vault_id: String,
        folder_path: String,
    },
    FolderRemoved {
        vault_id: String,
        folder_path: String,
    },
}

fn rel_path(root: &Path, abs: &Path) -> Option<String> {
    let rel = abs.strip_prefix(root).ok()?;
    let rel = storage::normalize_relative_path(rel);

    for excluded in constants::EXCLUDED_FOLDERS {
        if rel == *excluded || rel.starts_with(&format!("{}/", excluded)) {
            return None;
        }
    }

    Some(rel)
}

fn emit(app: &AppHandle, event: VaultFsEvent) {
    let _ = app.emit("vault_fs_event", event);
}

fn is_ignore_config_path(rel_path: &str) -> bool {
    rel_path == ".gitignore" || rel_path == ".vaultignore"
}

fn with_runtime_lock<T>(
    state: &State<'_, WatcherState>,
    update: impl FnOnce(&mut Option<WatcherRuntime>) -> T,
) -> Result<T, String> {
    let mut guard = state.inner.lock().map_err(|_| "watcher lock poisoned")?;
    Ok(update(&mut guard))
}

fn stop_runtime(runtime: WatcherRuntime) {
    let _ = runtime.stop_tx.send(());
    if let Some(handle) = runtime.join_handle {
        let (done_tx, done_rx) = mpsc::sync_channel::<()>(1);
        std::thread::spawn(move || {
            let _ = handle.join();
            let _ = done_tx.send(());
        });
        if done_rx.recv_timeout(Duration::from_secs(3)).is_err() {
            log::warn!("stop_runtime: timed out joining watcher thread");
        }
    }
}

fn stop_active_runtime(state: &State<'_, WatcherState>) -> Result<(), String> {
    let runtime = with_runtime_lock(state, |slot| slot.take())?;
    if let Some(runtime) = runtime {
        stop_runtime(runtime);
    }
    Ok(())
}

fn set_active_runtime(
    state: &State<'_, WatcherState>,
    runtime: WatcherRuntime,
) -> Result<(), String> {
    with_runtime_lock(state, |slot| {
        *slot = Some(runtime);
    })
}

const QUIET_PERIOD: Duration = Duration::from_millis(500);

// Paired with SUPPRESS_WINDOW_MS in
// src/lib/features/watcher/application/watcher_service.ts. Invariant: a
// debounced event must reach the frontend while the suppression entry for the
// app's own save is still alive, otherwise Carbide reads its own write as an
// external edit (reload on a clean buffer, conflict on a dirty one). Worst-case
// delivery is MAX_DELAY plus one 200ms loop tick, so both constants here must
// stay well under that window.
const MAX_DELAY: Duration = Duration::from_millis(750);

type PendingEvents = HashMap<String, (VaultFsEvent, Instant, Instant)>;

fn drain_ready(pending: &mut PendingEvents, now: Instant) -> Vec<VaultFsEvent> {
    let ready: Vec<String> = pending
        .iter()
        .filter(|(_, (_, first_seen, last_seen))| {
            now.duration_since(*last_seen) >= QUIET_PERIOD
                || now.duration_since(*first_seen) >= MAX_DELAY
        })
        .map(|(path, _)| path.clone())
        .collect();

    ready
        .into_iter()
        .filter_map(|path| pending.remove(&path).map(|(event, _, _)| event))
        .collect()
}

fn remember_pending(pending: &mut PendingEvents, rel: String, event: VaultFsEvent, now: Instant) {
    let first_seen = pending
        .get(&rel)
        .map(|(_, first_seen, _)| *first_seen)
        .unwrap_or(now);
    pending.insert(rel, (event, first_seen, now));
}

// A rename carries two paths in one notify event, so the from/to split cannot
// live in classify_event, which sees one path at a time. Each side is mapped to
// the equivalent create/remove kind and classified through the normal path.
fn rename_kind(mode: &RenameMode, path_index: usize, path_exists: bool) -> Option<EventKind> {
    let added = EventKind::Create(CreateKind::Any);
    let removed = EventKind::Remove(RemoveKind::Any);
    match mode {
        RenameMode::From => Some(removed),
        RenameMode::To => Some(added),
        RenameMode::Both => match path_index {
            0 => Some(removed),
            1 => Some(added),
            _ => None,
        },
        RenameMode::Any | RenameMode::Other => Some(if path_exists { added } else { removed }),
    }
}

// A removed or renamed-away directory no longer exists on disk, so the only
// signal left is the missing extension.
fn is_directory_path(kind: &EventKind, abs: &Path) -> bool {
    abs.is_dir()
        || (matches!(
            kind,
            EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_))
        ) && !abs.exists()
            && abs.extension().is_none())
}

// Stat'd by the caller rather than here, so classification stays pure and
// testable and the syscall happens only for the events that carry an mtime.
fn file_mtime_ms(path: &Path) -> Option<i64> {
    crate::features::notes::service::file_meta(path)
        .ok()
        .map(|(mtime_ms, _, _)| mtime_ms)
}

fn classify_event(
    kind: &EventKind,
    vault_id: &str,
    rel_path: String,
    is_markdown: bool,
    is_dir: bool,
    mtime_ms: Option<i64>,
) -> Option<VaultFsEvent> {
    match kind {
        EventKind::Create(_) if is_dir => Some(VaultFsEvent::FolderCreated {
            vault_id: vault_id.to_string(),
            folder_path: rel_path,
        }),
        EventKind::Remove(_) if is_dir => Some(VaultFsEvent::FolderRemoved {
            vault_id: vault_id.to_string(),
            folder_path: rel_path,
        }),
        _ if is_dir => None,
        EventKind::Create(_) if is_markdown => Some(VaultFsEvent::NoteAdded {
            vault_id: vault_id.to_string(),
            note_path: rel_path,
        }),
        EventKind::Remove(_) if is_markdown => Some(VaultFsEvent::NoteRemoved {
            vault_id: vault_id.to_string(),
            note_path: rel_path,
        }),
        EventKind::Modify(_) if is_markdown => Some(VaultFsEvent::NoteChangedExternally {
            vault_id: vault_id.to_string(),
            note_path: rel_path,
            mtime_ms,
        }),
        EventKind::Modify(_) => Some(VaultFsEvent::AssetChanged {
            vault_id: vault_id.to_string(),
            asset_path: rel_path,
        }),
        _ => None,
    }
}

#[tauri::command]
#[specta::specta]
pub async fn watch_vault(app: AppHandle, vault_id: String) -> Result<(), String> {
    crate::shared::blocking::blocking("watch_vault", move || watch_vault_inner(app, vault_id)).await
}

pub fn watch_vault_inner(app: AppHandle, vault_id: String) -> Result<(), String> {
    let state = app.state::<WatcherState>();
    {
        let current = state.current_vault_id.lock().map_err(|_| "lock poisoned")?;
        if current.as_deref() == Some(&vault_id) {
            log::debug!("Already watching vault_id={}, skipping", vault_id);
            return Ok(());
        }
    }
    log::info!("Watching vault vault_id={}", vault_id);
    stop_active_runtime(&state)?;

    let root = storage::vault_path(&app, &vault_id)?;
    let root_canon = root.canonicalize().map_err(|e| e.to_string())?;
    let (stop_tx, stop_rx) = mpsc::channel::<()>();

    let app_handle = app.clone();
    let vault_id_clone = vault_id.clone();

    let join_handle = std::thread::spawn(move || {
        let mut ignore_matcher = match vault_ignore::load_vault_ignore_matcher(
            &app_handle,
            &vault_id_clone,
            &root_canon,
        ) {
            Ok(matcher) => matcher,
            Err(error) => {
                log::error!("Failed to load ignore matcher: {}", error);
                return;
            }
        };
        let (tx, rx) = mpsc::sync_channel::<Result<notify::Event, notify::Error>>(512);

        let mut watcher = match RecommendedWatcher::new(
            move |res| {
                let _ = tx.send(res);
            },
            Config::default(),
        ) {
            Ok(w) => w,
            Err(e) => {
                log::error!("Failed to create file watcher: {}", e);
                return;
            }
        };

        if let Err(e) = watcher.watch(&root_canon, RecursiveMode::Recursive) {
            log::error!("Failed to start watching {}: {}", root_canon.display(), e);
            return;
        }

        let mut pending: PendingEvents = HashMap::new();

        loop {
            if stop_rx.try_recv().is_ok() {
                break;
            }

            for ready in drain_ready(&mut pending, Instant::now()) {
                emit(&app_handle, ready);
            }

            let res = match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(r) => r,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(_) => {
                    for (event, _, _) in std::mem::take(&mut pending).into_values() {
                        emit(&app_handle, event);
                    }
                    break;
                }
            };

            let event = match res {
                Ok(e) => e,
                Err(_) => continue,
            };

            let kind = &event.kind;
            let rename_mode = match kind {
                EventKind::Modify(ModifyKind::Name(mode)) => Some(mode),
                _ => None,
            };

            for (path_index, p) in event.paths.iter().enumerate() {
                let abs = match p.canonicalize() {
                    Ok(p) => p,
                    Err(_) => p.to_path_buf(),
                };

                if !abs.starts_with(&root_canon) {
                    continue;
                }

                let Some(rel) = rel_path(&root_canon, &abs) else {
                    continue;
                };
                if rel.is_empty() {
                    continue;
                }
                let is_dir = is_directory_path(kind, &abs);

                if is_ignore_config_path(&rel) {
                    if let Ok(next_matcher) = vault_ignore::load_vault_ignore_matcher(
                        &app_handle,
                        &vault_id_clone,
                        &root_canon,
                    ) {
                        ignore_matcher = next_matcher;
                    }
                }

                if ignore_matcher.is_ignored(&root_canon, &abs, is_dir) {
                    continue;
                }

                let ext = abs.extension().and_then(|e| e.to_str()).unwrap_or_default();
                let is_md = ext == "md";

                // Only notes and folders have add/remove events; an asset
                // rename keeps falling through to AssetChanged.
                let structural_rename = if is_md || is_dir { rename_mode } else { None };
                let effective_kind = match structural_rename {
                    Some(mode) => match rename_kind(mode, path_index, abs.exists()) {
                        Some(kind) => kind,
                        None => continue,
                    },
                    None => *kind,
                };

                let mtime_ms = match (&effective_kind, is_md) {
                    (EventKind::Modify(_), true) => file_mtime_ms(&abs),
                    _ => None,
                };

                let Some(vault_event) = classify_event(
                    &effective_kind,
                    &vault_id_clone,
                    rel.clone(),
                    is_md,
                    is_dir,
                    mtime_ms,
                ) else {
                    continue;
                };

                let should_debounce = matches!(
                    vault_event,
                    VaultFsEvent::AssetChanged { .. } | VaultFsEvent::NoteChangedExternally { .. }
                );

                if should_debounce {
                    remember_pending(&mut pending, rel, vault_event, Instant::now());
                    continue;
                }

                // A structural event must not overtake a debounced one for the
                // same path, or the reactor applies them out of order.
                if let Some((held, _, _)) = pending.remove(&rel) {
                    emit(&app_handle, held);
                }
                emit(&app_handle, vault_event);
            }
        }
    });

    set_active_runtime(
        &state,
        WatcherRuntime {
            stop_tx,
            join_handle: Some(join_handle),
        },
    )?;
    if let Ok(mut current) = state.current_vault_id.lock() {
        *current = Some(vault_id);
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn unwatch_vault(app: AppHandle) -> Result<(), String> {
    crate::shared::blocking::blocking("unwatch_vault", move || unwatch_vault_inner(app)).await
}

pub fn unwatch_vault_inner(app: AppHandle) -> Result<(), String> {
    let state = app.state::<WatcherState>();
    log::info!("Unwatching vault");
    if let Ok(mut current) = state.current_vault_id.lock() {
        *current = None;
    }
    stop_active_runtime(&state)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note_changed(path: &str) -> VaultFsEvent {
        VaultFsEvent::NoteChangedExternally {
            vault_id: "v1".to_string(),
            note_path: path.to_string(),
            mtime_ms: None,
        }
    }

    fn classify_renamed(mode: RenameMode, path_index: usize, path_exists: bool) -> VaultFsEvent {
        let kind =
            rename_kind(&mode, path_index, path_exists).expect("rename mode should map to a kind");
        classify_event(&kind, "v1", "notes/a.md".to_string(), true, false, None)
            .expect("markdown rename should classify")
    }

    #[test]
    fn classify_modify_on_directory_returns_none() {
        let result = classify_event(
            &EventKind::Modify(ModifyKind::Any),
            "v1",
            "assets".to_string(),
            false,
            true,
            None,
        );
        assert!(
            result.is_none(),
            "Modify on directory should be filtered out"
        );
    }

    #[test]
    fn classify_modify_on_file_returns_asset_changed() {
        let result = classify_event(
            &EventKind::Modify(ModifyKind::Any),
            "v1",
            "image.png".to_string(),
            false,
            false,
            None,
        );
        assert!(matches!(result, Some(VaultFsEvent::AssetChanged { .. })));
    }

    #[test]
    fn classify_modify_on_markdown_returns_note_changed() {
        let result = classify_event(
            &EventKind::Modify(ModifyKind::Any),
            "v1",
            "note.md".to_string(),
            true,
            false,
            None,
        );
        assert!(matches!(
            result,
            Some(VaultFsEvent::NoteChangedExternally { .. })
        ));
    }

    #[test]
    fn classify_modify_on_markdown_carries_the_mtime() {
        let result = classify_event(
            &EventKind::Modify(ModifyKind::Any),
            "v1",
            "note.md".to_string(),
            true,
            false,
            Some(1_234),
        );
        assert!(matches!(
            result,
            Some(VaultFsEvent::NoteChangedExternally {
                mtime_ms: Some(1_234),
                ..
            })
        ));
    }

    // The whole echo guard rests on these two numbers being the same number.
    // If the watcher ever computes mtime differently from the writer, every
    // comparison silently misses and the guard degrades to doing nothing.
    #[test]
    fn file_mtime_ms_matches_the_writers_mtime_exactly() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        std::fs::write(&path, "# A").unwrap();

        let (writer_mtime, _, _) =
            crate::features::notes::service::file_meta(&path).expect("file_meta should succeed");

        assert_eq!(file_mtime_ms(&path), Some(writer_mtime));
    }

    #[test]
    fn file_mtime_ms_is_none_for_a_missing_file() {
        let dir = tempfile::tempdir().unwrap();

        assert_eq!(file_mtime_ms(&dir.path().join("gone.md")), None);
    }

    #[test]
    fn classify_create_directory_returns_folder_created() {
        let result = classify_event(
            &EventKind::Create(CreateKind::Any),
            "v1",
            "new_folder".to_string(),
            false,
            true,
            None,
        );
        assert!(matches!(result, Some(VaultFsEvent::FolderCreated { .. })));
    }

    #[test]
    fn classify_remove_directory_returns_folder_removed() {
        let result = classify_event(
            &EventKind::Remove(RemoveKind::Any),
            "v1",
            "old_folder".to_string(),
            false,
            true,
            None,
        );
        assert!(matches!(result, Some(VaultFsEvent::FolderRemoved { .. })));
    }

    #[test]
    fn rename_from_classifies_as_note_removed() {
        assert!(matches!(
            classify_renamed(RenameMode::From, 0, false),
            VaultFsEvent::NoteRemoved { .. }
        ));
    }

    #[test]
    fn rename_to_classifies_as_note_added() {
        assert!(matches!(
            classify_renamed(RenameMode::To, 0, true),
            VaultFsEvent::NoteAdded { .. }
        ));
    }

    #[test]
    fn rename_both_removes_first_path_and_adds_second() {
        assert!(matches!(
            classify_renamed(RenameMode::Both, 0, false),
            VaultFsEvent::NoteRemoved { .. }
        ));
        assert!(matches!(
            classify_renamed(RenameMode::Both, 1, true),
            VaultFsEvent::NoteAdded { .. }
        ));
    }

    #[test]
    fn rename_both_ignores_paths_beyond_the_pair() {
        assert!(rename_kind(&RenameMode::Both, 2, true).is_none());
    }

    #[test]
    fn rename_any_probes_existence_both_ways() {
        assert!(matches!(
            classify_renamed(RenameMode::Any, 0, true),
            VaultFsEvent::NoteAdded { .. }
        ));
        assert!(matches!(
            classify_renamed(RenameMode::Any, 0, false),
            VaultFsEvent::NoteRemoved { .. }
        ));
    }

    #[test]
    fn renamed_away_directory_classifies_as_folder_removed() {
        let vanished = Path::new("/nonexistent-vault-root/old_folder");
        let kind = EventKind::Modify(ModifyKind::Name(RenameMode::From));

        assert!(is_directory_path(&kind, vanished));

        let result = classify_event(
            &rename_kind(&RenameMode::From, 0, false).unwrap(),
            "v1",
            "old_folder".to_string(),
            false,
            true,
            None,
        );
        assert!(matches!(result, Some(VaultFsEvent::FolderRemoved { .. })));
    }

    #[test]
    fn vanished_path_with_extension_is_not_a_directory() {
        let vanished = Path::new("/nonexistent-vault-root/old.md");
        let kind = EventKind::Modify(ModifyKind::Name(RenameMode::From));

        assert!(!is_directory_path(&kind, vanished));
    }

    #[test]
    fn drain_ready_emits_after_the_quiet_period() {
        let now = Instant::now();
        let mut pending = PendingEvents::new();
        remember_pending(
            &mut pending,
            "notes/a.md".to_string(),
            note_changed("notes/a.md"),
            now - QUIET_PERIOD,
        );

        let drained = drain_ready(&mut pending, now);

        assert_eq!(drained.len(), 1);
        assert!(pending.is_empty());
    }

    #[test]
    fn drain_ready_holds_entries_still_inside_the_quiet_period() {
        let now = Instant::now();
        let mut pending = PendingEvents::new();
        remember_pending(
            &mut pending,
            "notes/a.md".to_string(),
            note_changed("notes/a.md"),
            now - Duration::from_millis(100),
        );

        assert!(drain_ready(&mut pending, now).is_empty());
        assert_eq!(pending.len(), 1);
    }

    #[test]
    fn drain_ready_flushes_a_continuously_updated_entry_at_max_delay() {
        let now = Instant::now();
        let mut pending = PendingEvents::new();
        let path = "notes/a.md".to_string();
        remember_pending(
            &mut pending,
            path.clone(),
            note_changed("notes/a.md"),
            now - MAX_DELAY,
        );
        remember_pending(&mut pending, path, note_changed("notes/a.md"), now);

        let drained = drain_ready(&mut pending, now);

        assert_eq!(drained.len(), 1, "starvation cap should force a flush");
        assert!(pending.is_empty());
    }

    #[test]
    fn remember_pending_keeps_first_seen_and_replaces_the_event() {
        let now = Instant::now();
        let first_seen = now - Duration::from_millis(300);
        let mut pending = PendingEvents::new();
        let path = "notes/a.md".to_string();

        remember_pending(
            &mut pending,
            path.clone(),
            note_changed("notes/a.md"),
            first_seen,
        );
        remember_pending(
            &mut pending,
            path.clone(),
            VaultFsEvent::AssetChanged {
                vault_id: "v1".to_string(),
                asset_path: "notes/a.md".to_string(),
            },
            now,
        );

        let (event, stored_first_seen, last_seen) = pending.remove(&path).unwrap();
        assert!(matches!(event, VaultFsEvent::AssetChanged { .. }));
        assert_eq!(stored_first_seen, first_seen);
        assert_eq!(last_seen, now);
    }
}
