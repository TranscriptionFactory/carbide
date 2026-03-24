use crate::features::search::db as search_db;
use crate::shared::buffer::BufferManager;
use crate::shared::constants;
use crate::shared::io_utils;
use crate::shared::storage;
use crate::shared::vault_ignore;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::Read;
use std::path::Component;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use tauri::{AppHandle, State};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Type)]
pub struct NoteMeta {
    pub id: String,
    pub path: String,
    pub name: String,
    pub title: String,
    pub mtime_ms: i64,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct FileMeta {
    pub path: String,
    pub name: String,
    pub extension: String,
    pub size_bytes: i64,
    pub mtime_ms: i64,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct NoteDoc {
    pub meta: NoteMeta,
    pub markdown: String,
}

#[derive(Debug, Deserialize, Type)]
pub struct NoteWriteArgs {
    pub vault_id: String,
    pub note_id: String,
    pub markdown: String,
    pub expected_mtime_ms: Option<i64>,
}

fn parse_safe_relative_path(path: &str) -> Result<PathBuf, String> {
    let rel = PathBuf::from(path);
    if rel.is_absolute() {
        return Err("note path must be relative".to_string());
    }
    if rel.components().any(|c| {
        matches!(
            c,
            Component::ParentDir | Component::CurDir | Component::Prefix(_) | Component::RootDir
        )
    }) {
        return Err("note path contains invalid segments".to_string());
    }
    Ok(rel)
}

fn canonical_vault_root(vault_root: &Path) -> Result<PathBuf, String> {
    vault_root.canonicalize().map_err(|e| e.to_string())
}

fn resolve_under_vault_root(vault_root: &Path, rel: &Path) -> Result<PathBuf, String> {
    let base = canonical_vault_root(vault_root)?;
    let candidate = base.join(rel);

    let mut nearest_existing = candidate.as_path();
    while !nearest_existing.exists() {
        nearest_existing = nearest_existing
            .parent()
            .ok_or("note path escapes vault".to_string())?;
    }

    let nearest_existing_canon = nearest_existing.canonicalize().map_err(|e| e.to_string())?;
    if !nearest_existing_canon.starts_with(&base) {
        return Err("note path escapes vault".to_string());
    }

    let suffix = candidate
        .strip_prefix(nearest_existing)
        .map_err(|_| "note path escapes vault".to_string())?;
    let resolved = if suffix.as_os_str().is_empty() {
        nearest_existing_canon
    } else {
        nearest_existing_canon.join(suffix)
    };

    if !resolved.starts_with(&base) {
        return Err("note path escapes vault".to_string());
    }
    Ok(resolved)
}

fn reject_symlink_components(vault_root: &Path, rel: &Path) -> Result<(), String> {
    let mut current = vault_root.to_path_buf();
    for component in rel.components() {
        current.push(component.as_os_str());
        if !current.exists() {
            break;
        }
        let metadata = std::fs::symlink_metadata(&current).map_err(|e| e.to_string())?;
        if metadata.file_type().is_symlink() {
            return Err("note path contains symlink component".to_string());
        }
    }
    Ok(())
}

pub(crate) fn safe_vault_abs(vault_root: &Path, note_rel: &str) -> Result<PathBuf, String> {
    let rel = parse_safe_relative_path(note_rel)?;
    resolve_under_vault_root(vault_root, &rel)
}

pub(crate) fn safe_vault_abs_for_write(
    vault_root: &Path,
    note_rel: &str,
) -> Result<PathBuf, String> {
    let rel = parse_safe_relative_path(note_rel)?;
    let base = canonical_vault_root(vault_root)?;
    reject_symlink_components(&base, &rel)?;
    resolve_under_vault_root(&base, &rel)
}

pub(crate) fn safe_vault_rename_target_abs(
    vault_root: &Path,
    target_rel: &str,
) -> Result<PathBuf, String> {
    let rel = parse_safe_relative_path(target_rel)?;
    let leaf = rel
        .file_name()
        .ok_or("note path must include a leaf name")?;
    let parent_rel = rel.parent().unwrap_or_else(|| Path::new(""));

    let base = vault_root
        .canonicalize()
        .unwrap_or_else(|_| vault_root.to_path_buf());

    let parent_abs = if parent_rel.as_os_str().is_empty() {
        base.clone()
    } else {
        let parent_norm = storage::normalize_relative_path(parent_rel);
        safe_vault_abs(vault_root, &parent_norm)?
    };

    let target_abs = parent_abs.join(leaf);
    if !target_abs.starts_with(&base) {
        return Err("note path escapes vault".to_string());
    }

    Ok(target_abs)
}

fn name_from_rel_path(rel_path: &str) -> String {
    let leaf = rel_path.rsplit('/').next().unwrap_or(rel_path);
    leaf.strip_suffix(".md").unwrap_or(leaf).to_string()
}

fn resolve_folder_abs(root: &Path, folder_path: &str) -> Result<PathBuf, String> {
    if folder_path.is_empty() {
        Ok(root.to_path_buf())
    } else {
        safe_vault_abs(root, folder_path)
    }
}

fn ensure_directory(path: &Path, message: &str) -> Result<(), String> {
    if path.is_dir() {
        Ok(())
    } else {
        Err(message.to_string())
    }
}

pub(crate) fn extract_title(path: &Path) -> String {
    let mut file = match File::open(path) {
        Ok(f) => f,
        Err(_) => {
            return path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        }
    };

    let mut buf = vec![0u8; 8192];
    let n = match file.read(&mut buf) {
        Ok(n) => n,
        Err(_) => 0,
    };
    buf.truncate(n);

    let prefix = String::from_utf8_lossy(&buf);
    for line in prefix.lines() {
        let l = line.trim();
        if l.is_empty() {
            continue;
        }
        if let Some(rest) = l.strip_prefix("# ") {
            let t = rest.trim();
            if !t.is_empty() {
                return t.to_string();
            }
        }
        break;
    }

    path.file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

pub(crate) fn file_meta(path: &Path) -> Result<(i64, i64), String> {
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let size = meta.len() as i64;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    Ok((mtime, size))
}

fn build_note_meta(
    root: &Path,
    rel_path: &str,
    cached_titles: Option<&std::collections::HashMap<String, String>>,
) -> Result<NoteMeta, String> {
    let abs = safe_vault_abs(root, rel_path)?;
    let title = cached_titles
        .and_then(|m| m.get(rel_path).cloned())
        .unwrap_or_else(|| extract_title(&abs));
    let (mtime_ms, size_bytes) = file_meta(&abs)?;

    Ok(NoteMeta {
        id: rel_path.to_string(),
        path: rel_path.to_string(),
        name: name_from_rel_path(rel_path),
        title,
        mtime_ms,
        size_bytes,
    })
}

#[tauri::command]
#[specta::specta]
pub fn list_notes(app: AppHandle, vault_id: String) -> Result<Vec<NoteMeta>, String> {
    log::info!("Listing notes vault_id={}", vault_id);
    let root = storage::vault_path(&app, &vault_id).map_err(|e| {
        log::error!("Failed to resolve vault path for {}: {}", vault_id, e);
        e
    })?;
    let ignore_matcher = vault_ignore::load_vault_ignore_matcher(&app, &vault_id, &root)?;
    let mut out = Vec::new();

    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !constants::is_excluded_folder(&name)
                && !ignore_matcher.is_ignored(&root, e.path(), e.file_type().is_dir())
        })
        .filter_map(|e| e.ok())
    {
        let p = entry.path();
        if !entry.file_type().is_file() {
            continue;
        }
        if p.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }

        let rel = p.strip_prefix(&root).map_err(|e| e.to_string())?;
        let rel = storage::normalize_relative_path(rel);
        out.push(build_note_meta(&root, &rel, None)?);
    }

    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

#[tauri::command]
#[specta::specta]
pub fn read_note(
    app: AppHandle,
    vault_id: String,
    note_id: String,
    buffer_manager: State<'_, BufferManager>,
) -> Result<NoteDoc, String> {
    log::debug!("Reading note vault_id={} note_id={}", vault_id, note_id);
    let buffer_id = format!("note_{}", note_id);
    buffer_manager.open_buffer(&app, buffer_id.clone(), vault_id.clone(), note_id.clone())?;

    let buffer = buffer_manager
        .get_buffer(&buffer_id)
        .ok_or("Failed to retrieve buffer")?;
    let markdown = buffer.rope.to_string();
    let root = storage::vault_path(&app, &vault_id)?;

    Ok(NoteDoc {
        meta: build_note_meta(&root, &note_id, None)?,
        markdown,
    })
}

#[tauri::command]
#[specta::specta]
pub fn write_note(
    args: NoteWriteArgs,
    app: AppHandle,
    buffer_manager: State<'_, BufferManager>,
) -> Result<i64, String> {
    log::debug!(
        "Writing note vault_id={} note_id={}",
        args.vault_id,
        args.note_id
    );
    let root = storage::vault_path(&app, &args.vault_id)?;
    let abs = safe_vault_abs_for_write(&root, &args.note_id)?;

    if let Some(expected) = args.expected_mtime_ms {
        match file_meta(&abs) {
            Ok((disk_mtime, _)) if disk_mtime != expected => {
                return Err("conflict:mtime_mismatch".to_string());
            }
            Err(_) => {
                return Err("conflict:file_missing".to_string());
            }
            _ => {}
        }
    }

    let buffer_id = format!("note_{}", args.note_id);
    // Update the buffer in memory
    buffer_manager
        .update_buffer(buffer_id.clone(), &args.markdown)
        .or_else(|_| {
            // If buffer doesn't exist, open it first
            buffer_manager.open_buffer(
                &app,
                buffer_id.clone(),
                args.vault_id.clone(),
                args.note_id.clone(),
            )?;
            buffer_manager.update_buffer(buffer_id.clone(), &args.markdown)
        })?;

    // Persist buffer to disk
    buffer_manager.save_buffer(buffer_id)?;

    let (new_mtime, _) = file_meta(&abs)?;
    Ok(new_mtime)
}

#[derive(Serialize, Type)]
pub struct WriteAndIndexResult {
    pub new_mtime: i64,
    pub parsed: Option<crate::shared::markdown_doc::ParsedNoteDto>,
    pub diagnostics: Vec<crate::shared::markdown_doc::ParseDiagnostic>,
}

#[tauri::command]
#[specta::specta]
pub fn write_and_index_note(
    args: NoteWriteArgs,
    app: AppHandle,
    buffer_manager: State<'_, BufferManager>,
) -> Result<WriteAndIndexResult, String> {
    log::debug!(
        "Write+index note vault_id={} note_id={}",
        args.vault_id,
        args.note_id
    );
    let root = storage::vault_path(&app, &args.vault_id)?;
    let abs = safe_vault_abs_for_write(&root, &args.note_id)?;

    if let Some(expected) = args.expected_mtime_ms {
        match file_meta(&abs) {
            Ok((disk_mtime, _)) if disk_mtime != expected => {
                return Err("conflict:mtime_mismatch".to_string());
            }
            Err(_) => {
                return Err("conflict:file_missing".to_string());
            }
            _ => {}
        }
    }

    let buffer_id = format!("note_{}", args.note_id);
    buffer_manager
        .update_buffer(buffer_id.clone(), &args.markdown)
        .or_else(|_| {
            buffer_manager.open_buffer(
                &app,
                buffer_id.clone(),
                args.vault_id.clone(),
                args.note_id.clone(),
            )?;
            buffer_manager.update_buffer(buffer_id.clone(), &args.markdown)
        })?;

    buffer_manager.save_buffer(buffer_id)?;

    let (new_mtime, _) = file_meta(&abs)?;

    let result = crate::features::search::service::index_upsert_note_with_content(
        &app,
        &args.vault_id,
        &args.note_id,
        args.markdown,
    )?;

    Ok(WriteAndIndexResult {
        new_mtime,
        parsed: Some(result.note.into()),
        diagnostics: result.diagnostics,
    })
}

#[derive(Debug, Deserialize, Type)]
pub struct NoteCreateArgs {
    pub vault_id: String,
    pub note_path: String,
    pub initial_markdown: String,
}

#[tauri::command]
#[specta::specta]
pub fn create_note(args: NoteCreateArgs, app: AppHandle) -> Result<NoteMeta, String> {
    log::info!(
        "Creating note vault_id={} note_path={}",
        args.vault_id,
        args.note_path
    );
    let root = storage::vault_path(&app, &args.vault_id)?;
    let abs = safe_vault_abs_for_write(&root, &args.note_path)?;
    let dir = abs.parent().ok_or("invalid note path")?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    if abs.exists() {
        return Err("note already exists".to_string());
    }
    io_utils::atomic_write(&abs, args.initial_markdown.as_bytes())?;
    let note = build_note_meta(&root, &args.note_path, None)?;
    invalidate_note_parent_folder_cache(&args.vault_id, &note.path);
    Ok(note)
}

#[derive(Debug, Deserialize, Type)]
pub struct WriteImageAssetArgs {
    pub vault_id: String,
    pub note_path: String,
    pub mime_type: String,
    pub file_name: Option<String>,
    pub bytes: Vec<u8>,
    #[serde(default)]
    pub custom_filename: Option<String>,
    #[serde(default)]
    pub attachment_folder: Option<String>,
}

fn image_extension(mime_type: &str, file_name: Option<&str>) -> String {
    let from_name = file_name
        .and_then(|name| Path::new(name).extension())
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .filter(|ext| !ext.is_empty());
    if let Some(ext) = from_name {
        return ext;
    }

    match mime_type.to_ascii_lowercase().as_str() {
        "image/jpeg" => "jpg".to_string(),
        "image/png" => "png".to_string(),
        "image/gif" => "gif".to_string(),
        "image/webp" => "webp".to_string(),
        "image/bmp" => "bmp".to_string(),
        "image/svg+xml" => "svg".to_string(),
        _ => "png".to_string(),
    }
}

fn sanitize_stem(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.chars() {
        if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
            out.push(c.to_ascii_lowercase());
            continue;
        }

        if !out.ends_with('-') {
            out.push('-');
        }
    }

    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "image".to_string()
    } else {
        trimmed
    }
}

#[tauri::command]
#[specta::specta]
pub fn write_image_asset(args: WriteImageAssetArgs, app: AppHandle) -> Result<String, String> {
    log::debug!(
        "Writing image asset vault_id={} note_path={}",
        args.vault_id,
        args.note_path
    );
    let root = storage::vault_path(&app, &args.vault_id)?;
    let _ = safe_vault_abs_for_write(&root, &args.note_path)?;

    let note_rel = PathBuf::from(&args.note_path);
    let note_stem = note_rel
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("image");

    let attachment_folder = args.attachment_folder.as_deref().unwrap_or(".assets");
    if attachment_folder.contains('/')
        || attachment_folder.contains('\\')
        || attachment_folder.starts_with("..")
    {
        return Err("invalid attachment folder name".to_string());
    }

    let filename = if let Some(custom_filename) = args.custom_filename {
        let sanitized = custom_filename.replace('/', "").replace('\\', "");
        let sanitized = sanitized.trim_start_matches('.');
        if sanitized.is_empty() {
            return Err("invalid custom filename".to_string());
        }
        let has_extension = Path::new(sanitized)
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| !e.is_empty());
        if has_extension {
            sanitized.to_string()
        } else {
            let ext = image_extension(&args.mime_type, args.file_name.as_deref());
            format!("{}.{}", sanitized, ext)
        }
    } else {
        let source_stem = args
            .file_name
            .as_deref()
            .and_then(|name| Path::new(name).file_stem())
            .and_then(|stem| stem.to_str())
            .unwrap_or(note_stem);
        let ext = image_extension(&args.mime_type, args.file_name.as_deref());
        format!(
            "{}-{}.{}",
            sanitize_stem(source_stem),
            storage::now_ms(),
            ext
        )
    };

    let rel_path = PathBuf::from(attachment_folder).join(filename);
    let rel = storage::normalize_relative_path(&rel_path);
    let abs = safe_vault_abs_for_write(&root, &rel)?;

    io_utils::atomic_write(&abs, args.bytes)?;

    Ok(rel)
}

#[derive(Debug, Deserialize, Type)]
pub struct NoteRenameArgs {
    pub vault_id: String,
    pub from: String,
    pub to: String,
}

pub(crate) fn rename_with_temp_path(from_abs: &Path, to_abs: &Path) -> Result<(), String> {
    if from_abs == to_abs {
        return Ok(());
    }

    let from_parent = from_abs.parent().ok_or("invalid source path")?;
    let from_name = from_abs
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("invalid source filename")?;

    let mut temp_abs = from_parent.join(format!(".{}.rename.{}.tmp", from_name, storage::now_ms()));
    let mut attempt = 0usize;
    while temp_abs.exists() {
        attempt += 1;
        temp_abs = from_parent.join(format!(
            ".{}.rename.{}.{}.tmp",
            from_name,
            storage::now_ms(),
            attempt
        ));
    }

    std::fs::rename(from_abs, &temp_abs).map_err(|e| e.to_string())?;

    if let Err(step_two_error) = std::fs::rename(&temp_abs, to_abs) {
        let rollback_error = std::fs::rename(&temp_abs, from_abs).err();
        if let Some(rollback_error) = rollback_error {
            return Err(format!(
                "rename failed: {}; rollback failed: {}",
                step_two_error, rollback_error
            ));
        }
        return Err(step_two_error.to_string());
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn rename_note(args: NoteRenameArgs, app: AppHandle) -> Result<(), String> {
    log::info!(
        "Renaming note vault_id={} from={} to={}",
        args.vault_id,
        args.from,
        args.to
    );
    let root = storage::vault_path(&app, &args.vault_id)?;
    let from_abs = safe_vault_abs(&root, &args.from)?;
    let to_abs = safe_vault_rename_target_abs(&root, &args.to)?;
    if to_abs.exists() {
        let from_canon = from_abs.canonicalize().map_err(|e| e.to_string())?;
        let to_canon = to_abs.canonicalize().map_err(|e| e.to_string())?;
        if from_canon != to_canon {
            return Err("note already exists".to_string());
        }
    }
    let dir = to_abs.parent().ok_or("invalid destination path")?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    rename_with_temp_path(&from_abs, &to_abs)?;
    invalidate_note_parent_folder_cache(&args.vault_id, &args.from);
    let from_parent = parent_folder_path(&args.from);
    let to_parent = parent_folder_path(&args.to);
    if to_parent != from_parent {
        invalidate_folder_cache(&args.vault_id, &to_parent);
    }
    Ok(())
}

#[derive(Debug, Deserialize, Type)]
pub struct NoteDeleteArgs {
    pub vault_id: String,
    pub note_id: String,
}

#[derive(Debug, Clone)]
pub(crate) struct FolderEntry {
    pub(crate) name: String,
    pub(crate) is_dir: bool,
}

#[derive(Debug, Clone)]
struct FolderCacheEntry {
    items: Arc<[FolderEntry]>,
    cached_at: Instant,
    last_accessed: Instant,
}

const FOLDER_CACHE_TTL_SECS: u64 = 30;
const FOLDER_CACHE_MAX_ENTRIES: usize = 64;

static FOLDER_CACHE: OnceLock<Mutex<HashMap<String, FolderCacheEntry>>> = OnceLock::new();

fn folder_cache() -> &'static Mutex<HashMap<String, FolderCacheEntry>> {
    FOLDER_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn purge_expired_folder_cache(cache: &mut HashMap<String, FolderCacheEntry>) {
    cache.retain(|_, entry| entry.cached_at.elapsed().as_secs() < FOLDER_CACHE_TTL_SECS);
}

fn evict_folder_cache_if_needed(cache: &mut HashMap<String, FolderCacheEntry>) {
    while cache.len() > FOLDER_CACHE_MAX_ENTRIES {
        let oldest = cache
            .iter()
            .min_by_key(|(_, entry)| entry.last_accessed)
            .map(|(key, _)| key.clone());
        if let Some(key) = oldest {
            cache.remove(&key);
        } else {
            break;
        }
    }
}

pub(crate) fn invalidate_folder_cache(vault_id: &str, folder_path: &str) {
    if let Ok(mut cache) = folder_cache().lock() {
        let prefix = format!("{}:{}:", vault_id, folder_path);
        cache.retain(|key, _| !key.starts_with(&prefix));
    }
}

fn parent_folder_path(path: &str) -> String {
    path.rsplit_once('/')
        .map(|(parent, _)| parent.to_string())
        .unwrap_or_default()
}

fn invalidate_note_parent_folder_cache(vault_id: &str, note_path: &str) {
    let parent = parent_folder_path(note_path);
    invalidate_folder_cache(vault_id, &parent);
}

fn invalidate_folder_parent_cache(vault_id: &str, folder_path: &str) {
    let parent = parent_folder_path(folder_path);
    invalidate_folder_cache(vault_id, &parent);
}

pub(crate) fn scan_folder_entries(
    root: &Path,
    target: &Path,
    ignore_matcher: &vault_ignore::VaultIgnoreMatcher,
    show_hidden_files: bool,
) -> Result<Vec<FolderEntry>, String> {
    let mut items = Vec::new();

    for entry in std::fs::read_dir(target).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if constants::is_excluded_folder(&name) {
            continue;
        }
        if !show_hidden_files && name.starts_with('.') {
            continue;
        }

        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let is_dir = file_type.is_dir();
        if ignore_matcher.is_ignored(root, &entry.path(), is_dir) {
            continue;
        }

        items.push(FolderEntry { name, is_dir });
    }

    items.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a
            .name
            .to_ascii_lowercase()
            .cmp(&b.name.to_ascii_lowercase())
            .then_with(|| a.name.cmp(&b.name)),
    });

    Ok(items)
}

pub(crate) fn get_or_scan_folder_entries(
    cache_key: &str,
    root: &Path,
    target: &Path,
    ignore_matcher: &vault_ignore::VaultIgnoreMatcher,
    show_hidden_files: bool,
) -> Result<Arc<[FolderEntry]>, String> {
    {
        let mut cache = folder_cache().lock().map_err(|e| e.to_string())?;
        purge_expired_folder_cache(&mut cache);
        if let Some(entry) = cache.get_mut(cache_key) {
            entry.last_accessed = Instant::now();
            return Ok(Arc::clone(&entry.items));
        }
    }

    let items = scan_folder_entries(root, target, ignore_matcher, show_hidden_files)?;
    let items = Arc::<[FolderEntry]>::from(items);
    let now = Instant::now();

    let mut cache = folder_cache().lock().map_err(|e| e.to_string())?;
    purge_expired_folder_cache(&mut cache);
    cache.insert(
        cache_key.to_string(),
        FolderCacheEntry {
            items: Arc::clone(&items),
            cached_at: now,
            last_accessed: now,
        },
    );
    evict_folder_cache_if_needed(&mut cache);

    Ok(items)
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct FolderContents {
    pub notes: Vec<NoteMeta>,
    pub files: Vec<FileMeta>,
    pub subfolders: Vec<String>,
    pub total_count: usize,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct FolderStats {
    pub note_count: usize,
    pub folder_count: usize,
}

#[tauri::command]
#[specta::specta]
pub fn delete_note(args: NoteDeleteArgs, app: AppHandle) -> Result<(), String> {
    log::info!(
        "Deleting note vault_id={} note_id={}",
        args.vault_id,
        args.note_id
    );
    let root = storage::vault_path(&app, &args.vault_id)?;
    let abs = safe_vault_abs(&root, &args.note_id)?;
    std::fs::remove_file(&abs).map_err(|e| e.to_string())?;
    invalidate_note_parent_folder_cache(&args.vault_id, &args.note_id);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn list_folders(app: AppHandle, vault_id: String) -> Result<Vec<String>, String> {
    log::debug!("Listing folders vault_id={}", vault_id);
    let root = storage::vault_path(&app, &vault_id)?;
    let ignore_matcher = vault_ignore::load_vault_ignore_matcher(&app, &vault_id, &root)?;
    let mut out = Vec::new();

    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !constants::is_excluded_folder(&name)
                && !ignore_matcher.is_ignored(&root, e.path(), e.file_type().is_dir())
        })
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_dir() || entry.path() == root.as_path() {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(&root)
            .map_err(|e| e.to_string())?;
        out.push(storage::normalize_relative_path(rel));
    }

    out.sort();
    Ok(out)
}

#[derive(Debug, Deserialize, Type)]
pub struct FolderCreateArgs {
    pub vault_id: String,
    pub parent_path: String,
    pub folder_name: String,
}

#[tauri::command]
#[specta::specta]
pub fn create_folder(args: FolderCreateArgs, app: AppHandle) -> Result<(), String> {
    log::debug!(
        "Creating folder vault_id={} parent_path={} folder_name={}",
        args.vault_id,
        args.parent_path,
        args.folder_name
    );
    let root = storage::vault_path(&app, &args.vault_id)?;
    let parent = resolve_folder_abs(&root, &args.parent_path)?;
    ensure_directory(&parent, "parent path is not a directory")?;
    if args.folder_name.contains('/')
        || args.folder_name.contains('\\')
        || args.folder_name.starts_with('.')
    {
        return Err("invalid folder name".to_string());
    }
    let target = parent.join(&args.folder_name);
    std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    invalidate_folder_cache(&args.vault_id, &args.parent_path);
    Ok(())
}

#[derive(Debug, Deserialize, Type)]
pub struct FolderRenameArgs {
    pub vault_id: String,
    pub from_path: String,
    pub to_path: String,
}

#[derive(Debug, Clone, Deserialize, Type)]
pub struct MoveItem {
    pub path: String,
    pub is_folder: bool,
}

#[derive(Debug, Deserialize, Type)]
pub struct MoveItemsArgs {
    pub vault_id: String,
    pub items: Vec<MoveItem>,
    pub target_folder: String,
    pub overwrite: bool,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct MoveItemResult {
    pub path: String,
    pub new_path: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
struct PendingMove {
    item: MoveItem,
    destination_path: String,
}

fn move_target_path(target_folder: &str, source_path: &str) -> Result<String, String> {
    let leaf = Path::new(source_path)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("invalid source path")?;
    if target_folder.is_empty() {
        Ok(leaf.to_string())
    } else {
        Ok(format!("{}/{}", target_folder, leaf))
    }
}

fn is_descendant_path(path: &str, parent: &str) -> bool {
    if parent.is_empty() {
        return false;
    }
    path == parent || path.starts_with(&format!("{}/", parent))
}

fn remove_existing_move_target(
    source_is_folder: bool,
    source_abs: &Path,
    target_abs: &Path,
) -> Result<(), String> {
    if !target_abs.exists() {
        return Ok(());
    }

    let source_canon = source_abs.canonicalize().map_err(|e| e.to_string())?;
    let target_canon = target_abs.canonicalize().map_err(|e| e.to_string())?;
    if source_canon == target_canon {
        return Ok(());
    }

    let target_meta = std::fs::metadata(target_abs).map_err(|e| e.to_string())?;
    if source_is_folder {
        if !target_meta.is_dir() {
            return Err("cannot overwrite file with folder".to_string());
        }
        std::fs::remove_dir_all(target_abs).map_err(|e| e.to_string())?;
        return Ok(());
    }

    if target_meta.is_dir() {
        return Err("cannot overwrite folder with note".to_string());
    }
    std::fs::remove_file(target_abs).map_err(|e| e.to_string())?;
    Ok(())
}

fn move_failure(
    path: &str,
    new_path: impl Into<String>,
    error: impl Into<String>,
) -> MoveItemResult {
    MoveItemResult {
        path: path.to_string(),
        new_path: new_path.into(),
        success: false,
        error: Some(error.into()),
    }
}

fn move_success(path: String, new_path: String) -> MoveItemResult {
    MoveItemResult {
        path,
        new_path,
        success: true,
        error: None,
    }
}

fn collect_nested_move_sources(
    items: &[MoveItem],
    folder_path: &str,
    invalid_sources: &mut Vec<String>,
) {
    for other in items {
        if other.path == folder_path {
            continue;
        }
        if is_descendant_path(&other.path, folder_path) {
            invalid_sources.push(other.path.clone());
        }
    }
}

fn collect_pending_moves(
    root: &Path,
    args: &MoveItemsArgs,
) -> Result<(Vec<MoveItemResult>, Vec<PendingMove>), String> {
    let mut results = Vec::with_capacity(args.items.len());
    let mut candidates: Vec<PendingMove> = Vec::new();
    let mut invalid_sources: Vec<String> = Vec::new();
    let mut seen_paths: HashSet<String> = HashSet::new();

    for item in &args.items {
        if !seen_paths.insert(item.path.to_lowercase()) {
            results.push(move_failure(
                &item.path,
                item.path.clone(),
                "duplicate item path",
            ));
            continue;
        }

        if item.path.is_empty() {
            results.push(move_failure(
                &item.path,
                item.path.clone(),
                "cannot move vault root",
            ));
            continue;
        }

        if item.is_folder && is_descendant_path(&args.target_folder, &item.path) {
            results.push(move_failure(
                &item.path,
                item.path.clone(),
                "cannot move folder into itself",
            ));
            continue;
        }

        let source_abs = safe_vault_abs(root, &item.path)?;
        let source_meta = match std::fs::metadata(&source_abs) {
            Ok(meta) => meta,
            Err(error) => {
                results.push(move_failure(
                    &item.path,
                    item.path.clone(),
                    error.to_string(),
                ));
                continue;
            }
        };

        if item.is_folder && !source_meta.is_dir() {
            results.push(move_failure(
                &item.path,
                item.path.clone(),
                "source is not a directory",
            ));
            continue;
        }

        if !item.is_folder && !source_meta.is_file() {
            results.push(move_failure(
                &item.path,
                item.path.clone(),
                "source is not a file",
            ));
            continue;
        }

        let destination_path = move_target_path(&args.target_folder, &item.path)?;
        if destination_path == item.path {
            results.push(move_failure(
                &item.path,
                destination_path,
                "item already in target folder",
            ));
            continue;
        }

        if item.is_folder {
            collect_nested_move_sources(&args.items, &item.path, &mut invalid_sources);
        }

        candidates.push(PendingMove {
            item: item.clone(),
            destination_path,
        });
    }

    let invalid_source_set: HashSet<String> = invalid_sources
        .into_iter()
        .map(|path| path.to_lowercase())
        .collect();
    let mut pending: Vec<PendingMove> = Vec::new();
    for candidate in candidates {
        if invalid_source_set.contains(&candidate.item.path.to_lowercase()) {
            results.push(move_failure(
                &candidate.item.path,
                candidate.destination_path,
                "item is contained within another moved folder",
            ));
            continue;
        }
        pending.push(candidate);
    }

    Ok((results, pending))
}

fn execute_pending_moves(
    root: &Path,
    args: &MoveItemsArgs,
    pending: Vec<PendingMove>,
    invalidate_paths: &mut HashSet<String>,
) -> Result<Vec<MoveItemResult>, String> {
    let mut results = Vec::with_capacity(pending.len());

    for pending_move in pending {
        let item = pending_move.item;
        let destination_path = pending_move.destination_path;
        let source_abs = safe_vault_abs(root, &item.path)?;
        let destination_abs = safe_vault_rename_target_abs(root, &destination_path)?;
        if let Some(parent_abs) = destination_abs.parent() {
            std::fs::create_dir_all(parent_abs).map_err(|e| e.to_string())?;
        }

        if destination_abs.exists() {
            if !args.overwrite {
                results.push(move_failure(
                    &item.path,
                    destination_path.clone(),
                    "target already exists",
                ));
                continue;
            }
            if let Err(error) =
                remove_existing_move_target(item.is_folder, &source_abs, &destination_abs)
            {
                results.push(move_failure(&item.path, destination_path.clone(), error));
                continue;
            }
        }

        match rename_with_temp_path(&source_abs, &destination_abs) {
            Ok(()) => {
                let from_parent = parent_folder_path(&item.path);
                let to_parent = parent_folder_path(&destination_path);
                invalidate_paths.insert(from_parent);
                invalidate_paths.insert(to_parent);
                results.push(move_success(item.path, destination_path));
            }
            Err(error) => {
                results.push(move_failure(&item.path, destination_path, error));
            }
        }
    }

    Ok(results)
}

#[tauri::command]
#[specta::specta]
pub fn move_items(args: MoveItemsArgs, app: AppHandle) -> Result<Vec<MoveItemResult>, String> {
    log::info!(
        "Moving items vault_id={} target_folder={} item_count={}",
        args.vault_id,
        args.target_folder,
        args.items.len()
    );
    let root = storage::vault_path(&app, &args.vault_id)?;
    let target_abs = resolve_folder_abs(&root, &args.target_folder)?;
    ensure_directory(&target_abs, "target is not a directory")?;

    let (mut results, pending) = collect_pending_moves(&root, &args)?;
    let mut invalidate_paths: HashSet<String> = HashSet::new();
    let executed_results = execute_pending_moves(&root, &args, pending, &mut invalidate_paths)?;
    results.extend(executed_results);

    for path in invalidate_paths {
        invalidate_folder_cache(&args.vault_id, &path);
    }

    Ok(results)
}

#[tauri::command]
#[specta::specta]
pub fn rename_folder(args: FolderRenameArgs, app: AppHandle) -> Result<(), String> {
    log::debug!(
        "Renaming folder vault_id={} from_path={} to_path={}",
        args.vault_id,
        args.from_path,
        args.to_path
    );
    let root = storage::vault_path(&app, &args.vault_id)?;
    if args.from_path.is_empty() || args.to_path.is_empty() {
        return Err("cannot rename vault root".to_string());
    }
    let from_abs = safe_vault_abs(&root, &args.from_path)?;
    let to_abs = safe_vault_rename_target_abs(&root, &args.to_path)?;
    if !from_abs.is_dir() {
        return Err("source is not a directory".to_string());
    }
    if let Some(dir) = to_abs.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    rename_with_temp_path(&from_abs, &to_abs)?;
    invalidate_folder_parent_cache(&args.vault_id, &args.from_path);
    let from_parent = parent_folder_path(&args.from_path);
    let to_parent = parent_folder_path(&args.to_path);
    if to_parent != from_parent {
        invalidate_folder_cache(&args.vault_id, &to_parent);
    }
    Ok(())
}

#[derive(Debug, Deserialize, Type)]
pub struct FolderDeleteArgs {
    pub vault_id: String,
    pub folder_path: String,
}

#[tauri::command]
#[specta::specta]
pub fn delete_folder(args: FolderDeleteArgs, app: AppHandle) -> Result<(), String> {
    log::debug!(
        "Deleting folder vault_id={} folder_path={}",
        args.vault_id,
        args.folder_path
    );
    let root = storage::vault_path(&app, &args.vault_id)?;
    if args.folder_path.is_empty() {
        return Err("cannot delete vault root".to_string());
    }
    let abs = safe_vault_abs(&root, &args.folder_path)?;
    if !abs.is_dir() {
        return Err("path is not a directory".to_string());
    }

    std::fs::remove_dir_all(&abs).map_err(|e| e.to_string())?;
    invalidate_folder_parent_cache(&args.vault_id, &args.folder_path);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn list_folder_contents(
    app: AppHandle,
    vault_id: String,
    folder_path: String,
    offset: usize,
    limit: usize,
    show_hidden_files: bool,
) -> Result<FolderContents, String> {
    log::debug!(
        "Listing folder contents vault_id={} folder_path={}",
        vault_id,
        folder_path
    );
    let root = storage::vault_path(&app, &vault_id)?;
    let target = resolve_folder_abs(&root, &folder_path)?;
    ensure_directory(&target, "not a directory")?;
    let ignore_matcher = vault_ignore::load_vault_ignore_matcher(&app, &vault_id, &root)?;

    let key = format!(
        "{}:{}:{}:{}",
        vault_id,
        folder_path,
        ignore_matcher.cache_token(),
        show_hidden_files
    );
    let items =
        get_or_scan_folder_entries(&key, &root, &target, &ignore_matcher, show_hidden_files)?;
    let total_count = items.len();
    let start = offset.min(total_count);
    let end = start.saturating_add(limit).min(total_count);

    let mut notes = Vec::new();
    let mut files = Vec::new();
    let mut subfolders = Vec::new();

    let md_paths: Vec<String> = items[start..end]
        .iter()
        .filter(|e| !e.is_dir && e.name.ends_with(".md"))
        .map(|e| {
            if folder_path.is_empty() {
                e.name.clone()
            } else {
                format!("{}/{}", folder_path, e.name)
            }
        })
        .collect();

    let cached_titles = search_db::open_search_db(&app, &vault_id)
        .and_then(|conn| search_db::get_cached_titles(&conn, &md_paths))
        .ok();

    for entry in &items[start..end] {
        let rel = if folder_path.is_empty() {
            entry.name.clone()
        } else {
            format!("{}/{}", folder_path, entry.name)
        };

        if entry.is_dir {
            subfolders.push(rel);
        } else if entry.name.ends_with(".md") {
            notes.push(build_note_meta(&root, &rel, cached_titles.as_ref())?);
        } else {
            let abs = root.join(&rel);
            let (mtime_ms, size_bytes) = file_meta(&abs)?;
            let ext = std::path::Path::new(&entry.name)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_string();
            files.push(FileMeta {
                path: rel,
                name: entry.name.clone(),
                extension: ext,
                size_bytes,
                mtime_ms,
            });
        }
    }

    Ok(FolderContents {
        notes,
        files,
        subfolders,
        total_count,
        has_more: end < total_count,
    })
}

#[tauri::command]
#[specta::specta]
pub fn get_folder_stats(
    app: AppHandle,
    vault_id: String,
    folder_path: String,
) -> Result<FolderStats, String> {
    log::debug!(
        "Getting folder stats vault_id={} folder_path={}",
        vault_id,
        folder_path
    );
    let root = storage::vault_path(&app, &vault_id)?;
    let target = resolve_folder_abs(&root, &folder_path)?;
    ensure_directory(&target, "not a directory")?;
    let ignore_matcher = vault_ignore::load_vault_ignore_matcher(&app, &vault_id, &root)?;

    let mut note_count = 0usize;
    let mut folder_count = 0usize;

    for entry in WalkDir::new(&target)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !constants::is_excluded_folder(&name)
                && !name.starts_with('.')
                && !ignore_matcher.is_ignored(&root, e.path(), e.file_type().is_dir())
        })
        .filter_map(|e| e.ok())
    {
        if entry.path() == target.as_path() {
            continue;
        }

        if entry.file_type().is_file() {
            note_count += 1;
            continue;
        }

        if entry.file_type().is_dir() {
            folder_count += 1;
        }
    }

    Ok(FolderStats {
        note_count,
        folder_count,
    })
}

#[tauri::command]
#[specta::specta]
pub fn read_vault_file(
    app: AppHandle,
    vault_id: String,
    relative_path: String,
) -> Result<String, String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = safe_vault_abs(&root, &relative_path)?;

    let meta = std::fs::metadata(&abs).map_err(|e| e.to_string())?;
    if meta.len() > 5 * 1024 * 1024 {
        return Err("file exceeds 5 MB limit".to_string());
    }

    io_utils::read_file_to_string(&abs)
}

#[tauri::command]
#[specta::specta]
pub fn write_vault_file(
    app: AppHandle,
    vault_id: String,
    relative_path: String,
    content: String,
) -> Result<(), String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = safe_vault_abs(&root, &relative_path)?;
    io_utils::atomic_write(&abs, content.as_bytes())
}

#[tauri::command]
#[specta::specta]
pub fn write_bytes_to_path(path: String, data: Vec<u8>) -> Result<(), String> {
    io_utils::atomic_write(&path, &data)
}

#[tauri::command]
#[specta::specta]
pub fn delete_vault_file(
    app: AppHandle,
    vault_id: String,
    relative_path: String,
) -> Result<(), String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = safe_vault_abs(&root, &relative_path)?;
    std::fs::remove_file(&abs).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn list_vault_files_by_extension(
    app: AppHandle,
    vault_id: String,
    extension: String,
) -> Result<Vec<FileMeta>, String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let ignore_matcher = vault_ignore::load_vault_ignore_matcher(&app, &vault_id, &root)?;
    let ext_lower = extension.to_lowercase();

    let mut results = Vec::new();
    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !constants::is_excluded_folder(&name)
                && !ignore_matcher.is_ignored(&root, e.path(), e.file_type().is_dir())
        })
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let file_ext = entry
            .path()
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if file_ext != ext_lower {
            continue;
        }
        let rel = match entry.path().strip_prefix(&root) {
            Ok(r) => storage::normalize_relative_path(r),
            Err(_) => continue,
        };
        let name = entry
            .path()
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let meta = entry.metadata().ok();
        let mtime_ms = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let size_bytes = meta.as_ref().map(|m| m.len() as i64).unwrap_or(0);

        results.push(FileMeta {
            path: rel,
            name,
            extension: ext_lower.clone(),
            size_bytes,
            mtime_ms,
        });
    }
    results.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(results)
}

const ASSET_IMAGE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "tiff", "avif",
];

#[tauri::command]
#[specta::specta]
pub fn search_vault_assets(
    app: AppHandle,
    vault_id: String,
    query: String,
    limit: usize,
) -> Result<Vec<String>, String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let ignore_matcher = vault_ignore::load_vault_ignore_matcher(&app, &vault_id, &root)?;
    let query_lower = query.to_lowercase();
    let limit = if limit == 0 { 50 } else { limit };

    let mut results = Vec::new();
    for entry in WalkDir::new(&root)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !constants::is_excluded_folder(&name)
                && !ignore_matcher.is_ignored(&root, e.path(), e.file_type().is_dir())
        })
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let ext = entry
            .path()
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !ASSET_IMAGE_EXTENSIONS.contains(&ext.as_str()) {
            continue;
        }
        let rel = match entry.path().strip_prefix(&root) {
            Ok(r) => storage::normalize_relative_path(r),
            Err(_) => continue,
        };
        if !query_lower.is_empty() && !rel.to_lowercase().contains(&query_lower) {
            continue;
        }
        results.push(rel);
        if results.len() >= limit {
            break;
        }
    }
    Ok(results)
}
