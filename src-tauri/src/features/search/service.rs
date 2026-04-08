use crate::features::notes::service as notes_service;
use crate::features::search::db as search_db;
use crate::features::search::embeddings::{EmbeddingService, EmbeddingServiceState};
use crate::features::search::model::{
    BatchSemanticEdge, BlockSearchHit, EmbeddingStatus, HybridSearchHit, IndexNoteMeta, SearchHit,
    SearchScope, SemanticSearchHit,
};
use crate::features::search::{hybrid, vector_db};
use crate::shared::storage::{self, VaultMode};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Deserialize, Type)]
pub struct SearchQueryInput {
    #[allow(dead_code)]
    pub raw: String,
    pub text: String,
    pub scope: SearchScope,
}

#[derive(Clone, Serialize, Type)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum IndexProgressEvent {
    Started {
        vault_id: String,
        total: usize,
    },
    Progress {
        vault_id: String,
        indexed: usize,
        total: usize,
    },
    Completed {
        vault_id: String,
        indexed: usize,
        elapsed_ms: u64,
    },
    Failed {
        vault_id: String,
        error: String,
    },
}

#[derive(Clone, Serialize, Type)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum EmbeddingProgressEvent {
    Started {
        vault_id: String,
        total: usize,
    },
    Progress {
        vault_id: String,
        embedded: usize,
        total: usize,
    },
    Completed {
        vault_id: String,
        embedded: usize,
        elapsed_ms: u64,
    },
    Failed {
        vault_id: String,
        error: String,
    },
    BlockStarted {
        vault_id: String,
        total: usize,
    },
    BlockProgress {
        vault_id: String,
        embedded: usize,
        total: usize,
    },
    BlockCompleted {
        vault_id: String,
        embedded: usize,
    },
}

#[allow(dead_code)]
enum DbCommand {
    UpsertNote {
        vault_root: PathBuf,
        note_id: String,
        reply: SyncSender<Result<(), String>>,
    },
    UpsertNoteWithContent {
        vault_root: PathBuf,
        note_id: String,
        markdown: String,
        reply: SyncSender<Result<(), String>>,
    },
    RemoveNote {
        note_id: String,
        reply: SyncSender<Result<(), String>>,
    },
    RemoveNotes {
        note_ids: Vec<String>,
        reply: SyncSender<Result<(), String>>,
    },
    RemoveNotesByPrefix {
        prefix: String,
        reply: SyncSender<Result<(), String>>,
    },
    Rebuild {
        vault_root: PathBuf,
        cancel: Arc<AtomicBool>,
        app_handle: AppHandle,
        vault_id: String,
    },
    Sync {
        vault_root: PathBuf,
        cancel: Arc<AtomicBool>,
        app_handle: AppHandle,
        vault_id: String,
    },
    SyncPaths {
        vault_root: PathBuf,
        cancel: Arc<AtomicBool>,
        app_handle: AppHandle,
        vault_id: String,
        changed_paths: Vec<String>,
        removed_paths: Vec<String>,
    },
    EmbedBatch {
        vault_root: PathBuf,
        app_handle: AppHandle,
        vault_id: String,
        cancel: Arc<AtomicBool>,
    },
    RebuildEmbeddings {
        vault_root: PathBuf,
        app_handle: AppHandle,
        vault_id: String,
        cancel: Arc<AtomicBool>,
    },
    UpsertLinkedContent {
        source_name: String,
        file_path: String,
        title: String,
        body: String,
        page_offsets: Vec<usize>,
        file_type: String,
        modified_at: u64,
        linked_meta: crate::features::search::model::LinkedSourceMeta,
        app_handle: AppHandle,
        reply: SyncSender<Result<(), String>>,
    },
    UpdateLinkedMetadata {
        source_name: String,
        external_file_path: String,
        linked_meta: crate::features::search::model::LinkedSourceMeta,
        reply: SyncSender<Result<bool, String>>,
    },
    RenamePaths {
        old_prefix: String,
        new_prefix: String,
        reply: SyncSender<Result<usize, String>>,
    },
    RenamePath {
        old_path: String,
        new_path: String,
        reply: SyncSender<Result<(), String>>,
    },
    Shutdown,
}

struct VaultWorker {
    write_tx: mpsc::Sender<DbCommand>,
    read_conn: Arc<Mutex<Connection>>,
    cancel: Arc<AtomicBool>,
    join_handle: Option<JoinHandle<()>>,
}

#[derive(Default)]
pub struct SearchDbState {
    workers: Mutex<HashMap<String, VaultWorker>>,
}

impl Drop for SearchDbState {
    fn drop(&mut self) {
        let mut map = match self.workers.lock() {
            Ok(m) => m,
            Err(e) => {
                log::warn!("SearchDbState::drop: lock poisoned: {e}");
                return;
            }
        };
        for (_vid, mut worker) in map.drain() {
            shutdown_worker(&mut worker);
        }
    }
}

fn shutdown_worker(worker: &mut VaultWorker) {
    worker.cancel.store(true, Ordering::Relaxed);
    let _ = worker.write_tx.send(DbCommand::Shutdown);
    if let Some(handle) = worker.join_handle.take() {
        let (done_tx, done_rx) = mpsc::sync_channel::<()>(1);
        std::thread::spawn(move || {
            let _ = handle.join();
            let _ = done_tx.send(());
        });
        if done_rx.recv_timeout(Duration::from_secs(5)).is_err() {
            log::warn!(
                "shutdown_worker: timed out joining worker thread — \
                 helper thread and worker thread leaked"
            );
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn tags_list_all(
    app: AppHandle,
    vault_id: String,
) -> Result<Vec<crate::features::search::model::TagInfo>, String> {
    with_read_conn(&app, &vault_id, |conn| search_db::list_all_tags(conn))
}

#[tauri::command]
#[specta::specta]
pub fn tags_get_notes_for_tag(
    app: AppHandle,
    vault_id: String,
    tag: String,
) -> Result<Vec<String>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        search_db::get_notes_for_tag(conn, &tag)
    })
}

#[tauri::command]
#[specta::specta]
pub fn tags_get_notes_for_tag_prefix(
    app: AppHandle,
    vault_id: String,
    tag: String,
) -> Result<Vec<String>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        search_db::get_notes_for_tag_prefix(conn, &tag)
    })
}

#[tauri::command]
#[specta::specta]
pub fn shutdown_search_worker(vault_id: String, app: AppHandle) -> Result<(), String> {
    let state = app.state::<SearchDbState>();
    let mut map = state.workers.lock().map_err(|e| e.to_string())?;
    if let Some(mut worker) = map.remove(&vault_id) {
        shutdown_worker(&mut worker);
    }
    Ok(())
}

fn ensure_worker(app: &AppHandle, vault_id: &str) -> Result<(), String> {
    if storage::vault_mode_for_id(app, vault_id)? == VaultMode::Browse {
        return Err("search indexing is not available in browse mode".to_string());
    }
    let state = app.state::<SearchDbState>();
    let mut map = state.workers.lock().map_err(|e| e.to_string())?;
    if map.contains_key(vault_id) {
        return Ok(());
    }

    let read_conn = search_db::open_search_db(app, vault_id)?;
    let write_conn = search_db::open_search_db(app, vault_id)?;
    let (tx, rx) = mpsc::channel::<DbCommand>();

    let vid_for_writer = vault_id.to_string();
    let handle = std::thread::spawn(move || {
        writer_thread_loop(vid_for_writer, rx, write_conn);
    });

    let worker = VaultWorker {
        write_tx: tx,
        read_conn: Arc::new(Mutex::new(read_conn)),
        cancel: Arc::new(AtomicBool::new(false)),
        join_handle: Some(handle),
    };
    map.insert(vault_id.to_string(), worker);
    Ok(())
}

fn writer_thread_loop(
    _vault_id: String,
    rx: Receiver<DbCommand>,
    conn: Connection,
) {
    let mut notes_cache: BTreeMap<String, IndexNoteMeta> =
        match search_db::get_all_notes_from_db(&conn) {
            Ok(map) => map,
            Err(e) => {
                log::warn!("writer thread: failed to load notes cache: {e}");
                BTreeMap::new()
            }
        };

    for cmd in &rx {
        match dispatch_command(&conn, cmd, &mut notes_cache, &rx) {
            LoopAction::Continue => {}
            LoopAction::Break => break,
        }
    }
}

enum LoopAction {
    Continue,
    Break,
}

fn dispatch_command(
    conn: &Connection,
    cmd: DbCommand,
    notes_cache: &mut BTreeMap<String, IndexNoteMeta>,
    rx: &Receiver<DbCommand>,
) -> LoopAction {
    match cmd {
        DbCommand::UpsertNote {
            vault_root,
            note_id,
            reply,
        } => {
            let result = handle_upsert(conn, &vault_root, &note_id, notes_cache);
            if let Err(ref e) = result {
                log::warn!("writer: upsert failed for {note_id}: {e}");
            }
            let _ = reply.send(result);
        }
        DbCommand::UpsertNoteWithContent {
            vault_root,
            note_id,
            markdown,
            reply,
        } => {
            let result =
                handle_upsert_with_content(conn, &vault_root, &note_id, &markdown, notes_cache);
            if let Err(ref e) = result {
                log::warn!("writer: upsert_with_content failed for {note_id}: {e}");
            }
            let _ = reply.send(result);
        }
        DbCommand::RemoveNote { note_id, reply } => {
            let result = search_db::remove_note(conn, &note_id);
            if let Err(ref e) = result {
                log::warn!("writer: remove failed for {note_id}: {e}");
            } else {
                notes_cache.remove(&note_id);
            }
            let _ = reply.send(result);
        }
        DbCommand::RemoveNotes { note_ids, reply } => {
            let result = search_db::remove_notes(conn, &note_ids);
            if let Err(ref e) = result {
                log::warn!("writer: batch remove failed: {e}");
            } else {
                for id in &note_ids {
                    notes_cache.remove(id);
                }
            }
            let _ = reply.send(result);
        }
        DbCommand::RemoveNotesByPrefix { prefix, reply } => {
            let result = search_db::remove_notes_by_prefix(conn, &prefix);
            if let Err(ref e) = result {
                log::warn!("writer: prefix remove failed for {prefix}: {e}");
            } else {
                let matching_keys: Vec<String> = notes_cache
                    .keys()
                    .filter(|k| k.starts_with(&prefix))
                    .cloned()
                    .collect();
                for key in matching_keys {
                    notes_cache.remove(&key);
                }
            }
            let _ = reply.send(result);
        }
        DbCommand::UpsertLinkedContent {
            source_name,
            file_path,
            title,
            body,
            page_offsets,
            file_type,
            modified_at,
            linked_meta,
            app_handle,
            reply,
        } => {
            let result = search_db::upsert_linked_content(
                conn,
                &source_name,
                &file_path,
                &title,
                &body,
                &page_offsets,
                &file_type,
                modified_at,
                &linked_meta,
            );
            match &result {
                Ok(meta) => {
                    notes_cache.insert(meta.path.clone(), meta.clone());
                    let embed_text = if body.trim().is_empty() {
                        Path::new(&file_path)
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or(&file_path)
                            .to_string()
                    } else {
                        body.clone()
                    };
                    let embedding_state = app_handle.state::<EmbeddingServiceState>();
                    let cache_dir = resolve_embedding_cache_dir(&app_handle);
                    match embedding_state.get_or_init(cache_dir, &app_handle) {
                        Ok(model) => {
                            match model.embed_one(&embed_text) {
                                Ok(vec) => {
                                    if let Err(e) = vector_db::upsert_embedding(conn, &meta.path, &vec) {
                                        log::warn!("writer: embed linked note failed: {e}");
                                    }
                                }
                                Err(e) => {
                                    log::warn!("writer: embed linked note model error: {e}");
                                    let _ = vector_db::remove_embedding(conn, &meta.path);
                                }
                            }
                        }
                        Err(e) => {
                            log::debug!("writer: embedding model unavailable for linked note: {e}");
                            let _ = vector_db::remove_embedding(conn, &meta.path);
                        }
                    }
                }
                Err(e) => {
                    log::warn!("writer: upsert_linked_content failed: {e}");
                }
            }
            let _ = reply.send(result.map(|_| ()));
        }
        DbCommand::UpdateLinkedMetadata {
            source_name,
            external_file_path,
            linked_meta,
            reply,
        } => {
            let result = match search_db::find_linked_note_path(conn, &source_name, &external_file_path) {
                Ok(Some(path)) => {
                    search_db::update_linked_metadata(conn, &path, &linked_meta).map(|_| true)
                }
                Ok(None) => Ok(false),
                Err(e) => Err(e),
            };
            let _ = reply.send(result);
        }
        DbCommand::RenamePaths {
            old_prefix,
            new_prefix,
            reply,
        } => {
            let result = search_db::rename_folder_paths(conn, &old_prefix, &new_prefix);
            if let Ok(count) = &result {
                if *count > 0 {
                    let old_keys: Vec<String> = notes_cache
                        .keys()
                        .filter(|k| k.starts_with(&old_prefix))
                        .cloned()
                        .collect();
                    for old_key in old_keys {
                        if let Some(mut meta) = notes_cache.remove(&old_key) {
                            let new_path =
                                format!("{}{}", new_prefix, &old_key[old_prefix.len()..]);
                            meta.id = new_path.clone();
                            meta.path = new_path;
                            notes_cache.insert(meta.id.clone(), meta);
                        }
                    }
                }
            }
            let _ = reply.send(result);
        }
        DbCommand::RenamePath {
            old_path,
            new_path,
            reply,
        } => {
            let result = search_db::rename_note_path(conn, &old_path, &new_path);
            if let Ok(()) = &result {
                if let Some(mut meta) = notes_cache.remove(&old_path) {
                    meta.id = new_path.clone();
                    meta.path = new_path.clone();
                    notes_cache.insert(new_path, meta);
                }
            }
            let _ = reply.send(result);
        }
        DbCommand::Rebuild {
            vault_root,
            cancel,
            app_handle,
            vault_id,
        } => {
            handle_rebuild(
                conn,
                &vault_root,
                &cancel,
                &app_handle,
                &vault_id,
                rx,
                notes_cache,
            );
        }
        DbCommand::Sync {
            vault_root,
            cancel,
            app_handle,
            vault_id,
        } => {
            handle_sync(
                conn,
                &vault_root,
                &cancel,
                &app_handle,
                &vault_id,
                rx,
                notes_cache,
            );
        }
        DbCommand::SyncPaths {
            vault_root,
            cancel,
            app_handle,
            vault_id,
            changed_paths,
            removed_paths,
        } => {
            handle_sync_paths(
                conn,
                &vault_root,
                &cancel,
                &app_handle,
                &vault_id,
                rx,
                notes_cache,
                &changed_paths,
                &removed_paths,
            );
        }
        DbCommand::EmbedBatch {
            vault_root,
            app_handle,
            vault_id,
            cancel,
        } => {
            handle_embed_batch(
                conn,
                &vault_root,
                &cancel,
                &app_handle,
                &vault_id,
                notes_cache,
                false,
            );
        }
        DbCommand::RebuildEmbeddings {
            vault_root,
            app_handle,
            vault_id,
            cancel,
        } => {
            handle_embed_batch(
                conn,
                &vault_root,
                &cancel,
                &app_handle,
                &vault_id,
                notes_cache,
                true,
            );
        }
        DbCommand::Shutdown => {
            return LoopAction::Break;
        }
    }
    LoopAction::Continue
}

fn handle_upsert(
    conn: &Connection,
    vault_root: &Path,
    note_id: &str,
    notes_cache: &mut BTreeMap<String, IndexNoteMeta>,
) -> Result<(), String> {
    let abs = notes_service::safe_vault_abs(vault_root, note_id)?;
    let markdown = match std::fs::read_to_string(&abs) {
        Ok(content) => content,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let _ = search_db::remove_note(conn, note_id);
            notes_cache.remove(note_id);
            return Ok(());
        }
        Err(e) => return Err(e.to_string()),
    };
    let mut meta = search_db::extract_file_meta(&abs, vault_root)?;
    meta.title = extract_title(&markdown).unwrap_or_else(|| meta.name.clone());
    search_db::upsert_note_simple(conn, &meta, &markdown)?;
    notes_cache.insert(meta.path.clone(), meta);
    let _ = vector_db::remove_embedding(conn, note_id);
    let _ = vector_db::remove_block_embeddings(conn, note_id);
    Ok(())
}

fn handle_upsert_with_content(
    conn: &Connection,
    vault_root: &Path,
    note_id: &str,
    markdown: &str,
    notes_cache: &mut BTreeMap<String, IndexNoteMeta>,
) -> Result<(), String> {
    let abs = notes_service::safe_vault_abs(vault_root, note_id)?;
    let mut meta = search_db::extract_file_meta(&abs, vault_root)?;
    meta.title = extract_title(markdown).unwrap_or_else(|| meta.name.clone());
    search_db::upsert_note_simple(conn, &meta, markdown)?;
    notes_cache.insert(meta.path.clone(), meta);
    let _ = vector_db::remove_embedding(conn, note_id);
    let _ = vector_db::remove_block_embeddings(conn, note_id);
    Ok(())
}

fn extract_title(markdown: &str) -> Option<String> {
    let mut in_frontmatter = false;
    let mut seen_frontmatter_start = false;
    for line in markdown.lines() {
        let trimmed = line.trim();
        if trimmed == "---" {
            if !seen_frontmatter_start {
                in_frontmatter = true;
                seen_frontmatter_start = true;
                continue;
            } else if in_frontmatter {
                in_frontmatter = false;
                continue;
            }
        }
        if in_frontmatter {
            continue;
        }
        if trimmed.is_empty() {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("# ") {
            let t = rest.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
        break;
    }
    None
}

type IndexFn = fn(
    Option<&AppHandle>,
    &str,
    &Connection,
    &Path,
    &AtomicBool,
    &dyn Fn(usize, usize),
    &mut dyn FnMut(),
) -> Result<search_db::IndexResult, String>;

fn run_index_op(
    conn: &Connection,
    vault_root: &Path,
    cancel: &Arc<AtomicBool>,
    app_handle: &AppHandle,
    vault_id: &str,
    rx: &Receiver<DbCommand>,
    notes_cache: &mut BTreeMap<String, IndexNoteMeta>,
    label: &str,
    index_fn: IndexFn,
) {
    let start = Instant::now();
    let vid = vault_id.to_string();
    let app = app_handle.clone();
    let deferred: RefCell<Vec<DbCommand>> = RefCell::new(Vec::new());
    let started_emitted: RefCell<bool> = RefCell::new(false);
    let mut queued_sync_from_mutation = false;

    let result = {
        let mut drain_pending = || {
            while let Ok(cmd) = rx.try_recv() {
                match cmd {
                    DbCommand::Rebuild { .. }
                    | DbCommand::Sync { .. }
                    | DbCommand::SyncPaths { .. }
                    | DbCommand::EmbedBatch { .. }
                    | DbCommand::RebuildEmbeddings { .. } => {
                        deferred.borrow_mut().push(cmd);
                    }
                    DbCommand::Shutdown => {
                        log::warn!("writer: deferring shutdown during {label}");
                        deferred.borrow_mut().push(cmd);
                    }
                    DbCommand::UpsertNote { .. }
                    | DbCommand::UpsertNoteWithContent { .. }
                    | DbCommand::RemoveNote { .. }
                    | DbCommand::RemoveNotes { .. }
                    | DbCommand::RemoveNotesByPrefix { .. }
                    | DbCommand::UpsertLinkedContent { .. }
                    | DbCommand::UpdateLinkedMetadata { .. }
                    | DbCommand::RenamePaths { .. }
                    | DbCommand::RenamePath { .. } => {
                        cancel.store(true, Ordering::Relaxed);
                        dispatch_command(conn, cmd, notes_cache, rx);

                        if queued_sync_from_mutation {
                            continue;
                        }

                        match create_next_sync_cancel_token(app_handle, vault_id) {
                            Ok(next_cancel) => {
                                deferred.borrow_mut().push(DbCommand::Sync {
                                    vault_root: vault_root.to_path_buf(),
                                    cancel: next_cancel,
                                    app_handle: app_handle.clone(),
                                    vault_id: vault_id.to_string(),
                                });
                                queued_sync_from_mutation = true;
                            }
                            Err(error) => {
                                log::warn!(
                                    "writer: failed to queue deferred sync after mutation: {error}"
                                );
                            }
                        }
                    }
                }
            }
        };

        index_fn(
            Some(&app),
            &vid,
            conn,
            vault_root,
            cancel,
            &|indexed, total| {
                if !*started_emitted.borrow() {
                    *started_emitted.borrow_mut() = true;
                    let _ = app.emit(
                        "index_progress",
                        IndexProgressEvent::Started {
                            vault_id: vid.clone(),
                            total,
                        },
                    );
                } else {
                    let _ = app.emit(
                        "index_progress",
                        IndexProgressEvent::Progress {
                            vault_id: vid.clone(),
                            indexed,
                            total,
                        },
                    );
                }
            },
            &mut drain_pending,
        )
    };

    match result {
        Ok(res) => {
            if res.indexed > 0 {
                if let Err(e) = search_db::rebuild_property_registry(conn) {
                    log::warn!("{label}: property registry rebuild failed: {e}");
                }
            }
            if let Some(stats) = &res.vault_stats {
                let _ = app_handle.emit(
                    "vault_scan_stats",
                    serde_json::json!({
                        "vault_id": vid,
                        "note_count": stats.note_count,
                        "folder_count": stats.folder_count,
                    }),
                );
            }
            let elapsed_ms = start.elapsed().as_millis() as u64;
            let _ = app_handle.emit(
                "index_progress",
                IndexProgressEvent::Completed {
                    vault_id: vid.clone(),
                    indexed: res.indexed,
                    elapsed_ms,
                },
            );
        }
        Err(e) => {
            log::error!("{label} failed: {e}");
            let _ = app_handle.emit(
                "index_progress",
                IndexProgressEvent::Failed {
                    vault_id: vid.clone(),
                    error: e,
                },
            );
        }
    }

    match search_db::get_all_notes_from_db(conn) {
        Ok(map) => *notes_cache = map,
        Err(e) => log::warn!("writer: failed to reload notes cache after {label}: {e}"),
    }

    for cmd in deferred.into_inner() {
        if matches!(
            dispatch_command(conn, cmd, notes_cache, rx),
            LoopAction::Break
        ) {
            break;
        }
    }
}

fn create_next_sync_cancel_token(
    app_handle: &AppHandle,
    vault_id: &str,
) -> Result<Arc<AtomicBool>, String> {
    let next_cancel = Arc::new(AtomicBool::new(false));
    let state = app_handle.state::<SearchDbState>();
    let mut map = state.workers.lock().map_err(|e| e.to_string())?;
    let Some(worker) = map.get_mut(vault_id) else {
        return Err(format!("vault worker not found: {vault_id}"));
    };
    worker.cancel = Arc::clone(&next_cancel);
    Ok(next_cancel)
}

fn handle_rebuild(
    conn: &Connection,
    vault_root: &Path,
    cancel: &Arc<AtomicBool>,
    app_handle: &AppHandle,
    vault_id: &str,
    rx: &Receiver<DbCommand>,
    notes_cache: &mut BTreeMap<String, IndexNoteMeta>,
) {
    run_index_op(
        conn,
        vault_root,
        cancel,
        app_handle,
        vault_id,
        rx,
        notes_cache,
        "rebuild",
        search_db::rebuild_index,
    );
}

fn handle_sync(
    conn: &Connection,
    vault_root: &Path,
    cancel: &Arc<AtomicBool>,
    app_handle: &AppHandle,
    vault_id: &str,
    rx: &Receiver<DbCommand>,
    notes_cache: &mut BTreeMap<String, IndexNoteMeta>,
) {
    run_index_op(
        conn,
        vault_root,
        cancel,
        app_handle,
        vault_id,
        rx,
        notes_cache,
        "sync",
        search_db::sync_index,
    );
}

fn handle_sync_paths(
    conn: &Connection,
    vault_root: &Path,
    cancel: &Arc<AtomicBool>,
    app_handle: &AppHandle,
    vault_id: &str,
    rx: &Receiver<DbCommand>,
    notes_cache: &mut BTreeMap<String, IndexNoteMeta>,
    changed_paths: &[String],
    removed_paths: &[String],
) {
    let start = Instant::now();
    let deferred: RefCell<Vec<DbCommand>> = RefCell::new(Vec::new());

    let mut drain_pending = || {
        while let Ok(cmd) = rx.try_recv() {
            deferred.borrow_mut().push(cmd);
        }
    };

    let result = search_db::sync_index_paths(
        Some(app_handle),
        vault_id,
        conn,
        vault_root,
        cancel,
        &|_indexed, _total| {},
        &mut drain_pending,
        changed_paths,
        removed_paths,
    );

    match result {
        Ok(res) => {
            if res.indexed > 0 {
                if let Err(e) = search_db::rebuild_property_registry(conn) {
                    log::warn!("sync_paths: property registry rebuild failed: {e}");
                }
            }
            let elapsed_ms = start.elapsed().as_millis() as u64;
            log::info!("sync_paths: indexed {} in {}ms", res.indexed, elapsed_ms);
        }
        Err(e) => {
            log::error!("sync_paths failed: {e}");
        }
    }

    for path in removed_paths {
        notes_cache.remove(path);
    }
    for rel_path in changed_paths {
        let abs = vault_root.join(rel_path);
        if abs.exists() {
            if let Ok(meta) = search_db::extract_file_meta(&abs, vault_root) {
                notes_cache.insert(meta.path.clone(), meta);
            }
        } else {
            notes_cache.remove(rel_path);
        }
    }

    for cmd in deferred.into_inner() {
        if matches!(
            dispatch_command(conn, cmd, notes_cache, rx),
            LoopAction::Break
        ) {
            break;
        }
    }
}

fn handle_embed_batch(
    conn: &Connection,
    _vault_root: &Path,
    cancel: &Arc<AtomicBool>,
    app_handle: &AppHandle,
    vault_id: &str,
    notes_cache: &BTreeMap<String, IndexNoteMeta>,
    clear_first: bool,
) {
    let embedding_state = app_handle.state::<EmbeddingServiceState>();
    let cache_dir = resolve_embedding_cache_dir(app_handle);
    let model = match embedding_state.get_or_init(cache_dir, app_handle) {
        Ok(m) => m,
        Err(e) => {
            log::warn!("embed_batch: model unavailable: {e}");
            let _ = app_handle.emit(
                "embedding_progress",
                EmbeddingProgressEvent::Failed {
                    vault_id: vault_id.to_string(),
                    error: format!("Embedding model unavailable: {e}"),
                },
            );
            return;
        }
    };

    if clear_first {
        if let Err(e) = vector_db::clear_all_embeddings(conn) {
            log::warn!("embed_batch: clear failed: {e}");
        }
    }

    let model_version = vector_db::get_model_version(conn);
    if model_version.as_deref() != Some(vector_db::MODEL_VERSION) {
        log::info!(
            "embedding model version changed ({:?} -> {}), re-embedding all",
            model_version,
            vector_db::MODEL_VERSION
        );
        if let Err(e) = vector_db::clear_all_embeddings(conn) {
            log::warn!("embed_batch: clear for model upgrade failed: {e}");
        }
        if let Err(e) = vector_db::set_model_version(conn, vector_db::MODEL_VERSION) {
            log::warn!("embed_batch: failed to update model version: {e}");
        }
    }

    let already_embedded = vector_db::get_embedded_paths(conn);
    let notes_needing_embedding: Vec<(&str, &str)> = notes_cache
        .iter()
        .filter(|(path, _)| !already_embedded.contains(path.as_str()))
        .map(|(path, _)| (path.as_str(), path.as_str()))
        .collect();

    let total = notes_needing_embedding.len();
    if total == 0 {
        return;
    }

    let _ = app_handle.emit(
        "embedding_progress",
        EmbeddingProgressEvent::Started {
            vault_id: vault_id.to_string(),
            total,
        },
    );

    let start = Instant::now();
    let mut embedded = 0usize;
    let batch_size = 50;

    for chunk in notes_needing_embedding.chunks(batch_size) {
        if cancel.load(Ordering::Relaxed) {
            break;
        }

        let mut texts = Vec::with_capacity(chunk.len());
        let mut paths = Vec::with_capacity(chunk.len());

        for (path, _) in chunk {
            let body = match search_db::get_fts_body(conn, path) {
                Some(b) if !b.trim().is_empty() => b,
                _ => {
                    // No indexed body (binary/unreadable): embed the file name
                    // so it participates in name-based semantic similarity.
                    Path::new(path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(path)
                        .to_string()
                }
            };
            paths.push(*path);
            texts.push(body);
        }

        if texts.is_empty() {
            continue;
        }

        let text_refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
        match model.embed_batch(&text_refs, Some(cancel.as_ref())) {
            Ok(embeddings) => {
                for (path, embedding) in paths.iter().zip(embeddings.iter()) {
                    if let Err(e) = vector_db::upsert_embedding(conn, path, embedding) {
                        log::warn!("embed_batch: upsert failed for {path}: {e}");
                    }
                }
                embedded += embeddings.len();
            }
            Err(e) if e.contains("cancelled") => {
                log::info!("embed_batch: cancelled");
                break;
            }
            Err(e) => {
                log::warn!("embed_batch: batch embedding failed: {e}");
            }
        }

        let _ = app_handle.emit(
            "embedding_progress",
            EmbeddingProgressEvent::Progress {
                vault_id: vault_id.to_string(),
                embedded,
                total,
            },
        );
    }

    handle_block_embed_batch(conn, cancel, &model, vault_id, app_handle);

    let elapsed_ms = start.elapsed().as_millis() as u64;
    let _ = app_handle.emit(
        "embedding_progress",
        EmbeddingProgressEvent::Completed {
            vault_id: vault_id.to_string(),
            embedded,
            elapsed_ms,
        },
    );
}

const BLOCK_EMBED_MIN_WORDS: i64 = 20;
const BLOCK_EMBED_MIN_LINES: i64 = 10;

fn handle_block_embed_batch(
    conn: &Connection,
    cancel: &Arc<AtomicBool>,
    model: &EmbeddingService,
    vault_id: &str,
    app_handle: &AppHandle,
) {
    let sections = match search_db::get_embeddable_sections(
        conn,
        BLOCK_EMBED_MIN_WORDS,
        BLOCK_EMBED_MIN_LINES,
    ) {
        Ok(s) => s,
        Err(e) => {
            log::warn!("block_embed: failed to get sections for {vault_id}: {e}");
            return;
        }
    };

    let already_embedded = vector_db::get_block_embedded_keys(conn);
    let needing: Vec<&(String, String, i64, i64)> = sections
        .iter()
        .filter(|(path, heading_id, _, _)| {
            let key = format!("{path}\0{heading_id}");
            !already_embedded.contains(&key)
        })
        .collect();

    if needing.is_empty() {
        return;
    }

    let block_total = needing.len();
    log::info!("block_embed: {block_total} sections to embed for {vault_id}");
    let _ = app_handle.emit(
        "embedding_progress",
        EmbeddingProgressEvent::BlockStarted {
            vault_id: vault_id.to_string(),
            total: block_total,
        },
    );

    let batch_size = 50;
    let mut block_embedded = 0usize;
    let mut fts_cache: HashMap<String, Option<String>> = HashMap::new();

    for chunk in needing.chunks(batch_size) {
        if cancel.load(Ordering::Relaxed) {
            break;
        }

        let mut texts = Vec::with_capacity(chunk.len());
        let mut keys = Vec::with_capacity(chunk.len());

        for (path, heading_id, start_line, end_line) in chunk.iter().copied() {
            let body = match fts_cache
                .entry(path.to_string())
                .or_insert_with(|| search_db::get_fts_body(conn, path))
            {
                Some(b) => b.clone(),
                None => continue,
            };
            let lines: Vec<&str> = body.lines().collect();
            let start = *start_line as usize;
            let end = (*end_line as usize).min(lines.len());
            if start >= lines.len() {
                continue;
            }
            let section_text = lines[start..end].join("\n");
            if section_text.trim().is_empty() {
                continue;
            }
            keys.push((path.as_str(), heading_id.as_str()));
            texts.push(section_text);
        }

        if texts.is_empty() {
            continue;
        }

        let text_refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
        match model.embed_batch(&text_refs, Some(cancel.as_ref())) {
            Ok(embeddings) => {
                for ((path, heading_id), embedding) in keys.iter().zip(embeddings.iter()) {
                    if let Err(e) =
                        vector_db::upsert_block_embedding(conn, path, heading_id, embedding)
                    {
                        log::warn!("block_embed: upsert failed for {path}#{heading_id}: {e}");
                    }
                }
                block_embedded += embeddings.len();
                let _ = app_handle.emit(
                    "embedding_progress",
                    EmbeddingProgressEvent::BlockProgress {
                        vault_id: vault_id.to_string(),
                        embedded: block_embedded,
                        total: block_total,
                    },
                );
            }
            Err(e) if e.contains("cancelled") => {
                log::info!("block_embed: cancelled");
                break;
            }
            Err(e) => {
                log::warn!("block_embed: batch embedding failed: {e}");
            }
        }
    }

    if block_embedded > 0 {
        log::info!("block_embed: embedded {block_embedded} sections for {vault_id}");
    }
    let _ = app_handle.emit(
        "embedding_progress",
        EmbeddingProgressEvent::BlockCompleted {
            vault_id: vault_id.to_string(),
            embedded: block_embedded,
        },
    );
}

fn resolve_embedding_cache_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| PathBuf::from(".cache"))
        .join("models");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub(crate) fn with_read_conn<F, T>(app: &AppHandle, vault_id: &str, f: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    let read_conn = {
        ensure_worker(app, vault_id)?;
        let state = app.state::<SearchDbState>();
        let map = state.workers.lock().map_err(|e| e.to_string())?;
        let worker = map.get(vault_id).ok_or("vault worker not found")?;
        Arc::clone(&worker.read_conn)
    };
    let conn = read_conn.lock().map_err(|e| e.to_string())?;
    f(&conn)
}

fn send_write(app: &AppHandle, vault_id: &str, cmd: DbCommand) -> Result<(), String> {
    let tx = {
        ensure_worker(app, vault_id)?;
        let state = app.state::<SearchDbState>();
        let map = state.workers.lock().map_err(|e| e.to_string())?;
        let worker = map.get(vault_id).ok_or("vault worker not found")?;
        worker.write_tx.clone()
    };
    tx.send(cmd).map_err(|e| e.to_string())
}


fn send_write_reply<T>(
    app: &AppHandle,
    vault_id: &str,
    make_cmd: impl FnOnce(SyncSender<Result<T, String>>) -> DbCommand,
) -> Result<T, String> {
    let (reply_tx, reply_rx) = mpsc::sync_channel(1);
    let cmd = make_cmd(reply_tx);
    send_write(app, vault_id, cmd)?;
    reply_rx.recv().map_err(|e| e.to_string())?
}

fn send_write_blocking(
    app: &AppHandle,
    vault_id: &str,
    make_cmd: impl FnOnce(SyncSender<Result<(), String>>) -> DbCommand,
) -> Result<(), String> {
    send_write_reply(app, vault_id, make_cmd)
}

fn replace_worker_cancel_token(app: &AppHandle, vault_id: &str) -> Result<Arc<AtomicBool>, String> {
    let next_cancel = Arc::new(AtomicBool::new(false));
    ensure_worker(app, vault_id)?;
    let state = app.state::<SearchDbState>();
    let mut map = state.workers.lock().map_err(|e| e.to_string())?;
    let worker = map.get_mut(vault_id).ok_or("vault worker not found")?;
    worker.cancel.store(true, Ordering::Relaxed);
    worker.cancel = Arc::clone(&next_cancel);
    Ok(next_cancel)
}

fn enqueue_index_command(
    app: &AppHandle,
    vault_id: &str,
    make_cmd: impl FnOnce(PathBuf, Arc<AtomicBool>, AppHandle, String) -> DbCommand,
) -> Result<(), String> {
    let vault_root = storage::vault_path(app, vault_id)?;
    let cancel = replace_worker_cancel_token(app, vault_id)?;
    let cmd = make_cmd(vault_root, cancel, app.clone(), vault_id.to_string());
    send_write(app, vault_id, cmd)
}

#[tauri::command]
#[specta::specta]
pub fn index_build(app: AppHandle, vault_id: String) -> Result<(), String> {
    log::info!("Building index vault_id={}", vault_id);
    enqueue_index_command(
        &app,
        &vault_id,
        |vault_root, cancel, app_handle, vault_id| DbCommand::Sync {
            vault_root,
            cancel,
            app_handle,
            vault_id,
        },
    )
}

#[tauri::command]
#[specta::specta]
pub fn index_sync_paths(
    app: AppHandle,
    vault_id: String,
    changed_paths: Vec<String>,
    removed_paths: Vec<String>,
) -> Result<(), String> {
    log::info!(
        "Incremental sync vault_id={} changed={} removed={}",
        vault_id,
        changed_paths.len(),
        removed_paths.len()
    );
    let vault_root = storage::vault_path(&app, &vault_id)?;
    let cancel = replace_worker_cancel_token(&app, &vault_id)?;
    let cmd = DbCommand::SyncPaths {
        vault_root,
        cancel,
        app_handle: app.clone(),
        vault_id: vault_id.clone(),
        changed_paths,
        removed_paths,
    };
    send_write(&app, &vault_id, cmd)
}

#[tauri::command]
#[specta::specta]
pub fn index_cancel(app: AppHandle, vault_id: String) -> Result<(), String> {
    let cancel = {
        ensure_worker(&app, &vault_id)?;
        let state = app.state::<SearchDbState>();
        let map = state.workers.lock().map_err(|e| e.to_string())?;
        let worker = map.get(&vault_id).ok_or("vault worker not found")?;
        Arc::clone(&worker.cancel)
    };
    cancel.store(true, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn index_rebuild(app: AppHandle, vault_id: String) -> Result<(), String> {
    log::info!("Rebuilding index vault_id={}", vault_id);
    enqueue_index_command(
        &app,
        &vault_id,
        |vault_root, cancel, app_handle, vault_id| DbCommand::Rebuild {
            vault_root,
            cancel,
            app_handle,
            vault_id,
        },
    )
}

#[tauri::command]
#[specta::specta]
pub fn index_search(
    app: AppHandle,
    vault_id: String,
    query: SearchQueryInput,
) -> Result<Vec<SearchHit>, String> {
    log::debug!("Searching index vault_id={} query={}", vault_id, query.text);
    with_read_conn(&app, &vault_id, |conn| {
        search_db::search(conn, &query.text, query.scope, 50)
    })
}

#[tauri::command]
#[specta::specta]
pub fn index_suggest(
    app: AppHandle,
    vault_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<search_db::SuggestionHit>, String> {
    log::debug!(
        "Suggesting from index vault_id={} query={}",
        vault_id,
        query
    );
    let max = limit.unwrap_or(15);
    let fuzzy_threshold = 5;
    with_read_conn(&app, &vault_id, |conn| {
        let mut fts_results = search_db::suggest(conn, &query, max)?;
        if fts_results.len() >= fuzzy_threshold {
            return Ok(fts_results);
        }
        // BM25 scores are negative (more negative = better match).
        // Normalize to positive (higher = better) so consumers get a
        // consistent scale when FTS and fuzzy results are merged.
        for hit in &mut fts_results {
            hit.score = -hit.score;
        }
        let fuzzy_results = search_db::fuzzy_suggest(conn, &query, max)?;
        let seen: std::collections::HashSet<String> =
            fts_results.iter().map(|h| h.note.path.clone()).collect();
        let mut merged = fts_results;
        for hit in fuzzy_results {
            if !seen.contains(&hit.note.path) {
                merged.push(hit);
            }
        }
        // Re-sort the full merged list so the best results float to the
        // top regardless of source. Both FTS (now positive) and skim
        // scores use higher = better after normalization.
        merged.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        merged.truncate(max);
        Ok(merged)
    })
}

#[tauri::command]
#[specta::specta]
pub fn index_suggest_planned(
    app: AppHandle,
    vault_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<search_db::PlannedSuggestionHit>, String> {
    log::debug!(
        "Suggesting planned links from index vault_id={} query={}",
        vault_id,
        query
    );
    with_read_conn(&app, &vault_id, |conn| {
        search_db::suggest_planned(conn, &query, limit.unwrap_or(15))
    })
}

#[tauri::command]
#[specta::specta]
pub fn index_list_note_paths_by_prefix(
    app: AppHandle,
    vault_id: String,
    prefix: String,
) -> Result<Vec<String>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        search_db::list_note_paths_by_prefix(conn, &prefix)
    })
}

#[tauri::command]
#[specta::specta]
pub fn index_upsert_note(app: AppHandle, vault_id: String, note_id: String) -> Result<(), String> {
    let vault_root = storage::vault_path(&app, &vault_id)?;
    send_write_blocking(&app, &vault_id, |reply| DbCommand::UpsertNote {
        vault_root,
        note_id,
        reply,
    })
}

pub fn index_upsert_note_with_content(
    app: &AppHandle,
    vault_id: &str,
    note_id: &str,
    markdown: String,
) -> Result<(), String> {
    let vault_root = storage::vault_path(app, vault_id)?;
    send_write_blocking(app, vault_id, |reply| DbCommand::UpsertNoteWithContent {
        vault_root,
        note_id: note_id.to_string(),
        markdown,
        reply,
    })
}

#[tauri::command]
#[specta::specta]
pub fn index_remove_note(app: AppHandle, vault_id: String, note_id: String) -> Result<(), String> {
    send_write_blocking(&app, &vault_id, |reply| DbCommand::RemoveNote {
        note_id,
        reply,
    })
}

#[tauri::command]
#[specta::specta]
pub fn index_remove_notes(
    app: AppHandle,
    vault_id: String,
    note_ids: Vec<String>,
) -> Result<(), String> {
    send_write_blocking(&app, &vault_id, |reply| DbCommand::RemoveNotes {
        note_ids,
        reply,
    })
}

#[tauri::command]
#[specta::specta]
pub fn index_remove_notes_by_prefix(
    app: AppHandle,
    vault_id: String,
    prefix: String,
) -> Result<(), String> {
    send_write_blocking(&app, &vault_id, |reply| DbCommand::RemoveNotesByPrefix {
        prefix,
        reply,
    })
}

pub fn linked_source_index(
    app: &AppHandle,
    vault_id: &str,
    source_name: &str,
    file_path: &str,
    title: &str,
    body: &str,
    page_offsets: &[usize],
    file_type: &str,
    modified_at: u64,
    linked_meta: crate::features::search::model::LinkedSourceMeta,
) -> Result<(), String> {
    send_write_blocking(app, vault_id, |reply| DbCommand::UpsertLinkedContent {
        source_name: source_name.to_string(),
        file_path: file_path.to_string(),
        title: title.to_string(),
        body: body.to_string(),
        page_offsets: page_offsets.to_vec(),
        file_type: file_type.to_string(),
        modified_at,
        linked_meta,
        app_handle: app.clone(),
        reply,
    })
}

pub fn linked_source_remove(
    app: &AppHandle,
    vault_id: &str,
    source_name: &str,
    file_path: &str,
) -> Result<(), String> {
    let fname = std::path::Path::new(file_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(file_path);
    let note_path = search_db::linked_note_path(source_name, fname);
    send_write_blocking(app, vault_id, |reply| DbCommand::RemoveNote {
        note_id: note_path,
        reply,
    })
}

pub fn linked_source_clear(
    app: &AppHandle,
    vault_id: &str,
    source_name: &str,
) -> Result<(), String> {
    let prefix = format!("@linked/{source_name}/");
    send_write_blocking(app, vault_id, |reply| DbCommand::RemoveNotesByPrefix {
        prefix,
        reply,
    })
}

#[tauri::command]
#[specta::specta]
pub fn query_linked_notes_by_source(
    app: AppHandle,
    vault_id: String,
    source_name: String,
) -> Result<Vec<crate::features::search::model::LinkedNoteInfo>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        search_db::query_linked_notes_by_source(conn, &source_name)
    })
}

#[tauri::command]
#[specta::specta]
pub fn count_linked_notes_by_source(
    app: AppHandle,
    vault_id: String,
    source_name: String,
) -> Result<usize, String> {
    with_read_conn(&app, &vault_id, |conn| {
        search_db::count_linked_notes_by_source(conn, &source_name)
    })
}

#[tauri::command]
#[specta::specta]
pub fn find_note_by_citekey(
    app: AppHandle,
    vault_id: String,
    citekey: String,
) -> Result<Option<crate::features::search::model::LinkedNoteInfo>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        search_db::find_note_by_citekey(conn, &citekey)
    })
}

#[tauri::command]
#[specta::specta]
pub fn search_linked_notes(
    app: AppHandle,
    vault_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<crate::features::search::model::LinkedNoteInfo>, String> {
    let limit = limit.unwrap_or(50);
    with_read_conn(&app, &vault_id, |conn| {
        search_db::search_linked_notes(conn, &query, limit)
    })
}

#[tauri::command]
#[specta::specta]
pub fn update_linked_note_metadata(
    app: AppHandle,
    vault_id: String,
    source_name: String,
    external_file_path: String,
    linked_meta: crate::features::search::model::LinkedSourceMeta,
) -> Result<bool, String> {
    send_write_reply(&app, &vault_id, |reply| DbCommand::UpdateLinkedMetadata {
        source_name,
        external_file_path,
        linked_meta,
        reply,
    })
}

#[tauri::command]
#[specta::specta]
pub fn index_rename_folder(
    app: AppHandle,
    vault_id: String,
    old_prefix: String,
    new_prefix: String,
) -> Result<usize, String> {
    send_write_reply(&app, &vault_id, |reply| DbCommand::RenamePaths {
        old_prefix,
        new_prefix,
        reply,
    })
}

#[tauri::command]
#[specta::specta]
pub fn index_rename_note(
    app: AppHandle,
    vault_id: String,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    send_write_blocking(&app, &vault_id, |reply| DbCommand::RenamePath {
        old_path,
        new_path,
        reply,
    })
}

#[tauri::command]
#[specta::specta]
pub fn semantic_search(
    app: AppHandle,
    vault_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SemanticSearchHit>, String> {
    let embedding_state = app.state::<EmbeddingServiceState>();
    let cache_dir = resolve_embedding_cache_dir(&app);
    let model = embedding_state.get_or_init(cache_dir, &app)?;
    let query_vec = model.embed_one(&query)?;
    let limit = limit.unwrap_or(20);

    with_read_conn(&app, &vault_id, |conn| {
        let hits = vector_db::knn_search(conn, &query_vec, limit)?;
        let mut results = Vec::with_capacity(hits.len());
        for (path, distance) in hits {
            if let Ok(Some(note)) = search_db::get_note_meta(conn, &path) {
                results.push(SemanticSearchHit { note, distance });
            }
        }
        Ok(results)
    })
}

#[tauri::command]
#[specta::specta]
pub fn find_similar_notes(
    app: AppHandle,
    vault_id: String,
    note_path: String,
    limit: Option<usize>,
    exclude_linked: Option<bool>,
) -> Result<Vec<SemanticSearchHit>, String> {
    let limit = limit.unwrap_or(5);
    let exclude = exclude_linked.unwrap_or(false);

    with_read_conn(&app, &vault_id, |conn| {
        let query_vec = match vector_db::get_embedding(conn, &note_path) {
            Some(v) => v,
            None => return Ok(vec![]),
        };

        let fetch_limit = if exclude { limit + 20 } else { limit + 1 };
        let hits = vector_db::knn_search(conn, &query_vec, fetch_limit)?;

        let linked: std::collections::HashSet<String> = if exclude {
            let mut set = std::collections::HashSet::new();
            if let Ok(backlinks) = search_db::get_backlinks(conn, &note_path) {
                for n in backlinks {
                    set.insert(n.path.clone());
                }
            }
            if let Ok(outlinks) = search_db::get_outlinks(conn, &note_path) {
                for n in outlinks {
                    set.insert(n.path.clone());
                }
            }
            set
        } else {
            std::collections::HashSet::new()
        };

        let mut results = Vec::with_capacity(limit);
        for (path, distance) in hits {
            if path == note_path {
                continue;
            }
            if exclude && linked.contains(&path) {
                continue;
            }
            if let Ok(Some(note)) = search_db::get_note_meta(conn, &path) {
                results.push(SemanticSearchHit { note, distance });
                if results.len() >= limit {
                    break;
                }
            }
        }
        Ok(results)
    })
}

#[tauri::command]
#[specta::specta]
pub fn find_similar_blocks(
    app: AppHandle,
    vault_id: String,
    note_path: String,
    heading_id: String,
    limit: Option<usize>,
) -> Result<Vec<BlockSearchHit>, String> {
    let limit = limit.unwrap_or(10).min(50);

    with_read_conn(&app, &vault_id, |conn| {
        let blocks = vector_db::get_block_embeddings_for_note(conn, &note_path);
        let query_vec = match blocks.iter().find(|(hid, _)| *hid == heading_id) {
            Some((_, vec)) => vec,
            None => return Ok(vec![]),
        };

        let raw = vector_db::block_knn_search(conn, query_vec, limit + 1)?;
        let results: Vec<BlockSearchHit> = raw
            .into_iter()
            .filter(|(p, hid, _)| !(p == &note_path && hid == &heading_id))
            .take(limit)
            .map(|(path, hid, distance)| BlockSearchHit {
                path,
                heading_id: hid,
                distance,
            })
            .collect();
        Ok(results)
    })
}

#[tauri::command]
#[specta::specta]
pub fn semantic_search_batch(
    app: AppHandle,
    vault_id: String,
    paths: Vec<String>,
    limit: usize,
    distance_threshold: f32,
) -> Result<Vec<BatchSemanticEdge>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        let linked_sets = search_db::get_linked_paths_batch(conn, &paths)?;
        let edges = vector_db::knn_search_batch(
            conn,
            &paths,
            limit,
            distance_threshold,
            &linked_sets,
        )?;

        Ok(edges
            .into_iter()
            .map(|(source, target, distance)| BatchSemanticEdge {
                source,
                target,
                distance,
            })
            .collect())
    })
}

#[tauri::command]
#[specta::specta]
pub async fn hybrid_search(
    app: AppHandle,
    vault_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<HybridSearchHit>, String> {
    let embedding_state = app.state::<EmbeddingServiceState>();
    let cache_dir = resolve_embedding_cache_dir(&app);
    let model = embedding_state.get_or_init(cache_dir, &app)?;
    let limit = limit.unwrap_or(20);

    let read_conn = {
        ensure_worker(&app, &vault_id)?;
        let state = app.state::<SearchDbState>();
        let map = state.workers.lock().map_err(|e| e.to_string())?;
        let worker = map.get(vault_id.as_str()).ok_or("vault worker not found")?;
        Arc::clone(&worker.read_conn)
    };

    tauri::async_runtime::spawn_blocking(move || {
        let conn = read_conn.lock().map_err(|e| e.to_string())?;
        hybrid::hybrid_search(&conn, &model, &query, limit)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub fn get_embedding_status(app: AppHandle, vault_id: String) -> Result<EmbeddingStatus, String> {
    with_read_conn(&app, &vault_id, |conn| {
        let total_notes = search_db::get_note_count(conn)?;
        let embedded_notes = vector_db::get_embedding_count(conn);
        let model_version =
            vector_db::get_model_version(conn).unwrap_or_else(|| "unavailable".to_string());
        Ok(EmbeddingStatus {
            total_notes,
            embedded_notes,
            model_version,
            is_embedding: false,
        })
    })
}

#[tauri::command]
#[specta::specta]
pub fn rebuild_embeddings(app: AppHandle, vault_id: String) -> Result<(), String> {
    let vault_root = storage::vault_path(&app, &vault_id)?;
    let cancel = replace_worker_cancel_token(&app, &vault_id)?;
    let vid = vault_id.clone();
    send_write(
        &app,
        &vault_id,
        DbCommand::RebuildEmbeddings {
            vault_root,
            app_handle: app.clone(),
            vault_id: vid,
            cancel,
        },
    )
}

#[tauri::command]
#[specta::specta]
pub fn embed_sync(app: AppHandle, vault_id: String) -> Result<(), String> {
    let vault_root = storage::vault_path(&app, &vault_id)?;
    let cancel = replace_worker_cancel_token(&app, &vault_id)?;
    let vid = vault_id.clone();
    send_write(
        &app,
        &vault_id,
        DbCommand::EmbedBatch {
            vault_root,
            app_handle: app.clone(),
            vault_id: vid,
            cancel,
        },
    )
}

#[tauri::command]
#[specta::specta]
pub fn get_note_stats(
    app: AppHandle,
    vault_id: String,
    note_path: String,
) -> Result<crate::features::search::model::NoteStats, String> {
    with_read_conn(&app, &vault_id, |conn| {
        search_db::get_note_stats(conn, &note_path)
    })
}

#[tauri::command]
#[specta::specta]
pub fn get_note_headings(
    app: AppHandle,
    vault_id: String,
    note_path: String,
) -> Result<Vec<crate::features::search::model::NoteHeading>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        search_db::get_note_headings(conn, &note_path)
    })
}

#[tauri::command]
#[specta::specta]
pub fn get_note_links(
    app: AppHandle,
    vault_id: String,
    note_path: String,
) -> Result<Vec<crate::features::search::model::NoteLink>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        search_db::get_note_links(conn, &note_path)
    })
}

#[tauri::command]
#[specta::specta]
pub fn note_get_file_cache(
    app: AppHandle,
    vault_id: String,
    note_path: String,
) -> Result<crate::features::search::model::FileCache, String> {
    with_read_conn(&app, &vault_id, |conn| {
        search_db::get_file_cache(conn, &note_path)
    })
}

fn strip_link_suffix(raw: &str) -> &str {
    let trimmed = raw.trim();
    match trimmed.find(|c| c == '?' || c == '#') {
        Some(i) => &trimmed[..i],
        None => trimmed,
    }
}

fn source_dir(path: &str) -> &str {
    match path.rfind('/') {
        Some(i) => &path[..i],
        None => "",
    }
}

fn resolve_relative_path(base_dir: &str, target: &str) -> Option<String> {
    let mut segments: Vec<&str> = if base_dir.is_empty() {
        vec![]
    } else {
        base_dir.split('/').collect()
    };

    for part in target.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            if segments.is_empty() {
                return None;
            }
            segments.pop();
            continue;
        }
        segments.push(part);
    }

    if segments.is_empty() {
        None
    } else {
        Some(segments.join("/"))
    }
}

#[tauri::command]
#[specta::specta]
pub fn resolve_note_link(source_path: String, raw_target: String) -> Option<String> {
    let trimmed = strip_link_suffix(&raw_target);
    let base_dir = if trimmed.starts_with('/') {
        ""
    } else {
        source_dir(&source_path)
    };
    let cleaned = trimmed.trim_start_matches('/');
    if cleaned.is_empty() {
        return None;
    }
    let leaf = cleaned.rsplit('/').next().unwrap_or(cleaned);
    let candidate = if leaf.contains('.') {
        cleaned.to_string()
    } else {
        format!("{cleaned}.md")
    };
    resolve_relative_path(base_dir, &candidate)
}

#[tauri::command]
#[specta::specta]
pub fn resolve_wiki_link(source_path: String, raw_target: String) -> Option<String> {
    let cleaned = strip_link_suffix(&raw_target).trim_start_matches('/');
    if cleaned.is_empty() {
        return None;
    }
    let with_ext = if cleaned.ends_with(".md") {
        cleaned.to_string()
    } else {
        format!("{cleaned}.md")
    };
    let base_dir = if cleaned.starts_with("./") || cleaned.starts_with("../") {
        source_dir(&source_path)
    } else {
        ""
    };
    resolve_relative_path(base_dir, &with_ext)
}
