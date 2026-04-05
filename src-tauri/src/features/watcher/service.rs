use crate::shared::constants;
use crate::shared::storage;
use crate::shared::vault_ignore;
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use specta::Type;
use std::path::Path;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

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

        let mut last_emitted: HashMap<String, Instant> = HashMap::new();
        let debounce_ttl = Duration::from_secs(60);
        let mut last_cleanup = Instant::now();

        loop {
            if stop_rx.try_recv().is_ok() {
                break;
            }

            if last_cleanup.elapsed() > debounce_ttl {
                let cutoff = Instant::now() - debounce_ttl;
                last_emitted.retain(|_, v| *v > cutoff);
                last_cleanup = Instant::now();
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
                if rel.is_empty() {
                    continue;
                }
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

                if let Some(vault_event) = classify_event(kind, &vault_id_clone, rel.clone(), is_md, is_dir)
                {
                    let should_debounce = matches!(
                        vault_event,
                        VaultFsEvent::AssetChanged { .. } | VaultFsEvent::NoteChangedExternally { .. }
                    );
                    if should_debounce {
                        let now = Instant::now();
                        if let Some(&last) = last_emitted.get(&rel) {
                            if now.duration_since(last) < Duration::from_millis(500) {
                                continue;
                            }
                        }
                        last_emitted.insert(rel, now);
                    }
                    emit(&app_handle, vault_event);
                }
            }
        }
    });

    set_active_runtime(&state, WatcherRuntime { stop_tx, join_handle: Some(join_handle) })?;
    if let Ok(mut current) = state.current_vault_id.lock() {
        *current = Some(vault_id);
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn unwatch_vault(state: State<WatcherState>) -> Result<(), String> {
    log::info!("Unwatching vault");
    if let Ok(mut current) = state.current_vault_id.lock() {
        *current = None;
    }
    stop_active_runtime(&state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, ModifyKind, RemoveKind};

    #[test]
    fn classify_modify_on_directory_returns_none() {
        let result = classify_event(
            &EventKind::Modify(ModifyKind::Any),
            "v1",
            "assets".to_string(),
            false,
            true,
        );
        assert!(result.is_none(), "Modify on directory should be filtered out");
    }

    #[test]
    fn classify_modify_on_file_returns_asset_changed() {
        let result = classify_event(
            &EventKind::Modify(ModifyKind::Any),
            "v1",
            "image.png".to_string(),
            false,
            false,
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
        );
        assert!(matches!(
            result,
            Some(VaultFsEvent::NoteChangedExternally { .. })
        ));
    }

    #[test]
    fn classify_create_directory_returns_folder_created() {
        let result = classify_event(
            &EventKind::Create(CreateKind::Any),
            "v1",
            "new_folder".to_string(),
            false,
            true,
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
        );
        assert!(matches!(result, Some(VaultFsEvent::FolderRemoved { .. })));
    }
}
