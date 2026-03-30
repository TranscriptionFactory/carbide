use crate::shared::constants;
use crate::shared::storage;
use crate::shared::vault_ignore;
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use specta::Type;
use std::path::Path;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct WatcherState {
    inner: Arc<Mutex<Option<WatcherRuntime>>>,
}

struct WatcherRuntime {
    stop_tx: mpsc::Sender<()>,
    join_handle: Option<std::thread::JoinHandle<()>>,
}

#[derive(Debug, Serialize, Clone, Type)]
#[serde(tag = "type", rename_all = "snake_case")]
enum VaultFsEvent {
    NoteChangedExternally {
        vault_id: String,
        note_path: String,
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

fn classify_event(
    kind: &EventKind,
    vault_id: &str,
    rel_path: String,
    is_markdown: bool,
    is_dir: bool,
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
pub fn watch_vault(
    app: AppHandle,
    state: State<WatcherState>,
    vault_id: String,
) -> Result<(), String> {
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
        let (tx, rx) = mpsc::channel::<Result<notify::Event, notify::Error>>();

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

        loop {
            if stop_rx.try_recv().is_ok() {
                break;
            }

            let res = match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(r) => r,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(_) => break,
            };

            let event = match res {
                Ok(e) => e,
                Err(_) => continue,
            };

            let kind = &event.kind;
            for p in event.paths.iter() {
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
                let is_dir = abs.is_dir()
                    || (matches!(kind, EventKind::Remove(_))
                        && !abs.exists()
                        && abs.extension().is_none());

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

                if let Some(vault_event) = classify_event(kind, &vault_id_clone, rel, is_md, is_dir)
                {
                    emit(&app_handle, vault_event);
                }
            }
        }
    });

    set_active_runtime(&state, WatcherRuntime { stop_tx, join_handle: Some(join_handle) })?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn unwatch_vault(state: State<WatcherState>) -> Result<(), String> {
    log::info!("Unwatching vault");
    stop_active_runtime(&state)
}
