use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use specta::Type;
use std::collections::HashMap;
use std::path::Path;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct PluginWatcherState {
    inner: Arc<Mutex<Option<PluginWatcherRuntime>>>,
}

struct PluginWatcherRuntime {
    stop_tx: mpsc::Sender<()>,
}

#[derive(Debug, Serialize, Clone, Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PluginFsEvent {
    PluginChanged { plugin_id: String },
}

fn is_watched_file(name: &str) -> bool {
    matches!(name, "manifest.json" | "main.js" | "index.html")
}

fn extract_plugin_id(path: &Path, plugins_root: &Path) -> Option<String> {
    let rel = path.strip_prefix(plugins_root).ok()?;
    rel.components()
        .next()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
}

fn with_runtime_lock<T>(
    state: &State<'_, PluginWatcherState>,
    update: impl FnOnce(&mut Option<PluginWatcherRuntime>) -> T,
) -> Result<T, String> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| "plugin watcher lock poisoned")?;
    Ok(update(&mut guard))
}

fn stop_active_runtime(state: &State<'_, PluginWatcherState>) -> Result<(), String> {
    let runtime = with_runtime_lock(state, |slot| slot.take())?;
    if let Some(r) = runtime {
        let _ = r.stop_tx.send(());
    }
    Ok(())
}

fn set_active_runtime(
    state: &State<'_, PluginWatcherState>,
    runtime: PluginWatcherRuntime,
) -> Result<(), String> {
    with_runtime_lock(state, |slot| {
        *slot = Some(runtime);
    })
}

#[tauri::command]
#[specta::specta]
pub fn watch_plugins(
    app: AppHandle,
    state: State<PluginWatcherState>,
    vault_path: String,
) -> Result<(), String> {
    log::info!("Watching plugins vault_path={}", vault_path);
    stop_active_runtime(&state)?;

    let plugins_root = Path::new(&vault_path).join(".carbide").join("plugins");
    let plugins_root_canon = plugins_root
        .canonicalize()
        .map_err(|e| format!("plugins dir not found: {e}"))?;

    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let app_handle = app.clone();
    let root = plugins_root_canon.clone();

    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<Result<notify::Event, notify::Error>>();

        let mut watcher = match RecommendedWatcher::new(
            move |res| {
                let _ = tx.send(res);
            },
            Config::default(),
        ) {
            Ok(w) => w,
            Err(e) => {
                log::error!("Failed to create plugin watcher: {}", e);
                return;
            }
        };

        if let Err(e) = watcher.watch(&root, RecursiveMode::Recursive) {
            log::error!("Failed to watch plugins dir {}: {}", root.display(), e);
            return;
        }

        let mut last_emitted: HashMap<String, Instant> = HashMap::new();

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

            if !matches!(
                event.kind,
                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
            ) {
                continue;
            }

            for path in event.paths.iter() {
                let abs = match path.canonicalize() {
                    Ok(p) => p,
                    Err(_) => path.to_path_buf(),
                };

                let file_name = abs.file_name().and_then(|n| n.to_str()).unwrap_or_default();

                if !is_watched_file(file_name) {
                    continue;
                }

                let Some(plugin_id) = extract_plugin_id(&abs, &root) else {
                    continue;
                };

                let now = Instant::now();
                let last = last_emitted.get(&plugin_id).copied();
                if last.is_some_and(|t| now.duration_since(t) < Duration::from_millis(500)) {
                    continue;
                }
                last_emitted.insert(plugin_id.clone(), now);

                log::info!("Plugin changed: {}", plugin_id);
                let _ = app_handle.emit(
                    "plugin_fs_event",
                    PluginFsEvent::PluginChanged { plugin_id },
                );
            }
        }
    });

    set_active_runtime(&state, PluginWatcherRuntime { stop_tx })?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn unwatch_plugins(state: State<PluginWatcherState>) -> Result<(), String> {
    log::info!("Unwatching plugins");
    stop_active_runtime(&state)
}
