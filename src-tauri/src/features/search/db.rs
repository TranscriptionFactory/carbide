use crate::features::notes::service as notes_service;
use crate::features::search::model::{IndexNoteMeta, SearchHit, SearchScope};
use crate::features::search::vector_db;
use crate::shared::constants;
use crate::shared::io_utils;
use crate::shared::storage;
use crate::shared::vault_ignore;
use fuzzy_matcher::skim::SkimMatcherV2;
use fuzzy_matcher::FuzzyMatcher;
use rusqlite::{params, Connection};
use serde::Serialize;
use specta::Type;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

#[derive(Debug, Serialize, Type)]
pub struct SuggestionHit {
    pub note: IndexNoteMeta,
    pub score: f64,
}

#[derive(Debug, Serialize, Type)]
pub struct PlannedSuggestionHit {
    pub target_path: String,
    pub ref_count: i64,
}

#[derive(Debug, Serialize, Type)]
pub struct OrphanLink {
    pub target_path: String,
    pub ref_count: i64,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct VaultScanStats {
    pub note_count: usize,
    pub folder_count: usize,
}

pub struct VaultScanResult {
    pub indexable_files: Vec<PathBuf>,
    pub stats: VaultScanStats,
}

pub fn scan_vault(
    app: Option<&tauri::AppHandle>,
    vault_id: &str,
    root: &Path,
) -> Result<VaultScanResult, String> {
    let ignore_matcher = if let Some(app) = app {
        vault_ignore::load_vault_ignore_matcher(app, vault_id, root)?
    } else {
        vault_ignore::VaultIgnoreMatcher::default()
    };

    let mut files: Vec<PathBuf> = Vec::new();
    let mut note_count: usize = 0;
    let mut folder_count: usize = 0;

    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !constants::is_excluded_folder(&name)
                && !ignore_matcher.is_ignored(root, e.path(), e.file_type().is_dir())
        })
        .filter_map(|e| e.ok())
    {
        if entry.path() == root {
            continue;
        }

        let name = entry.file_name().to_string_lossy();
        let is_hidden = name.starts_with('.');

        if entry.file_type().is_dir() {
            if !is_hidden {
                folder_count += 1;
            }
        } else if entry.file_type().is_file() {
            files.push(entry.path().to_path_buf());
            if !is_hidden {
                note_count += 1;
            }
        }
    }

    files.sort();
    Ok(VaultScanResult {
        indexable_files: files,
        stats: VaultScanStats {
            note_count,
            folder_count,
        },
    })
}

pub(crate) fn list_indexable_files(
    app: Option<&tauri::AppHandle>,
    vault_id: &str,
    root: &Path,
) -> Result<Vec<PathBuf>, String> {
    Ok(scan_vault(app, vault_id, root)?.indexable_files)
}

fn resolve_snippet_page_from_json(
    snippet: Option<&str>,
    body: Option<&str>,
    offsets_json: Option<&str>,
) -> Option<u32> {
    let snippet = snippet?;
    let body = body?;
    let offsets_json = offsets_json?;
    let offsets: Vec<usize> = serde_json::from_str(offsets_json).ok()?;
    crate::features::search::text_extractor::resolve_snippet_page(snippet, body, &offsets)
}

fn file_stem_string(abs: &Path) -> String {
    abs.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_string()
}

fn is_canvas_file(abs: &Path) -> bool {
    let ext = abs.extension().and_then(|x| x.to_str()).unwrap_or("");
    matches!(ext, "canvas" | "excalidraw")
}

fn extract_indexable_body(abs: &Path, raw: &str) -> String {
    if is_canvas_file(abs) {
        match crate::features::canvas::canvas_link_extractor::extract_canvas_content(raw) {
            Ok(content) => content.text_body,
            Err(_) => String::new(),
        }
    } else {
        raw.to_string()
    }
}

pub(crate) fn extract_file_meta(abs: &Path, vault_root: &Path) -> Result<IndexNoteMeta, String> {
    let rel = abs.strip_prefix(vault_root).map_err(|e| e.to_string())?;
    let rel = storage::normalize_relative_path(rel);
    let ext = abs.extension().and_then(|x| x.to_str()).unwrap_or("");
    let name = if ext == "md" {
        file_stem_string(abs)
    } else {
        abs.file_name()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_string()
    };
    let (mtime_ms, size_bytes) = notes_service::file_meta(abs)?;
    Ok(IndexNoteMeta {
        id: rel.clone(),
        path: rel,
        title: name.clone(),
        name,
        mtime_ms,
        size_bytes,
        file_type: None,
        source: None,
    })
}

#[allow(dead_code)]
pub(crate) fn extract_meta(abs: &Path, vault_root: &Path) -> Result<IndexNoteMeta, String> {
    let mut meta = extract_file_meta(abs, vault_root)?;
    meta.title = notes_service::extract_title(abs);
    Ok(meta)
}

fn extract_title_from_markdown(markdown: &str) -> Option<String> {
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

pub(crate) fn extract_frontmatter_properties(markdown: &str) -> Vec<(String, String, String)> {
    let mut props = Vec::new();
    let mut lines = markdown.lines().peekable();

    match lines.next() {
        Some(first) if first.trim() == "---" => {}
        _ => return props,
    }

    let mut current_key: Option<String> = None;
    let mut array_values: Vec<String> = Vec::new();

    let flush_array = |key: &str, arr: &mut Vec<String>, out: &mut Vec<(String, String, String)>| {
        if !arr.is_empty() {
            let json = format!(
                "[{}]",
                arr.iter()
                    .map(|v| format!("\"{}\"", v.replace('\\', "\\\\").replace('"', "\\\"")))
                    .collect::<Vec<_>>()
                    .join(",")
            );
            out.push((key.to_string(), json, "array".to_string()));
            arr.clear();
        }
    };

    for line in lines {
        if line.trim() == "---" {
            if let Some(ref key) = current_key.take() {
                flush_array(key, &mut array_values, &mut props);
            }
            break;
        }

        if line.starts_with("  - ") || line.starts_with("\t- ") {
            let item = line.trim_start_matches(|c: char| c == ' ' || c == '\t').trim_start_matches("- ").trim();
            if current_key.is_some() {
                array_values.push(item.to_string());
            }
            continue;
        }

        if let Some(ref key) = current_key.take() {
            flush_array(key, &mut array_values, &mut props);
        }

        if let Some(colon_pos) = line.find(':') {
            let key = line[..colon_pos].trim().to_string();
            if key.is_empty() || key.contains(' ') {
                continue;
            }
            if key == "tags" {
                continue;
            }
            let rest = line[colon_pos + 1..].trim();
            if rest.is_empty() {
                current_key = Some(key);
                continue;
            }
            let value = rest.trim_matches(|c| c == '\'' || c == '"').to_string();
            let typ = if value.parse::<f64>().is_ok() {
                "number"
            } else if value == "true" || value == "false" {
                "boolean"
            } else {
                "string"
            };
            props.push((key, value, typ.to_string()));
        }
    }

    props
}

fn save_properties(conn: &Connection, path: &str, props: &[(String, String, String)]) -> Result<(), String> {
    conn.execute("DELETE FROM note_properties WHERE path = ?1", params![path])
        .map_err(|e| e.to_string())?;
    for (key, value, typ) in props {
        conn.execute(
            "INSERT INTO note_properties (path, key, value, type) VALUES (?1, ?2, ?3, ?4)",
            params![path, key, value, typ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn db_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .home_dir()
        .map_err(|e| e.to_string())?
        .join(".carbide")
        .join("caches")
        .join("vaults"))
}

fn db_path(app: &AppHandle, vault_id: &str) -> Result<PathBuf, String> {
    let dir = db_cache_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{}.db", vault_id)))
}

const EXPECTED_FTS_COLUMNS: &str = "title, name, path, body";

fn fts_schema_needs_migration(conn: &Connection) -> bool {
    let sql = "SELECT sql FROM sqlite_master WHERE type='table' AND name='notes_fts'";
    match conn.query_row(sql, [], |row| row.get::<_, String>(0)) {
        Ok(ddl) => !ddl.contains("name,"),
        Err(_) => false,
    }
}

fn tasks_schema_needs_migration(conn: &Connection) -> bool {
    let sql = "SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'";
    match conn.query_row(sql, [], |row| row.get::<_, String>(0)) {
        Ok(ddl) => !ddl.contains("status TEXT"),
        Err(_) => false,
    }
}

fn tags_schema_needs_migration(conn: &Connection) -> bool {
    let has_old = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='note_tags'",
            [],
            |_| Ok(()),
        )
        .is_ok();
    let has_new = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='note_inline_tags'",
            [],
            |_| Ok(()),
        )
        .is_ok();
    has_old && !has_new
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    if fts_schema_needs_migration(conn) {
        conn.execute_batch(
            "DROP TABLE IF EXISTS notes_fts;
             DELETE FROM notes;
             DELETE FROM outlinks;",
        )
        .map_err(|e| e.to_string())?;
    }

    if tasks_schema_needs_migration(conn) {
        conn.execute("DROP TABLE IF EXISTS tasks", [])
            .map_err(|e| e.to_string())?;
    }

    if tags_schema_needs_migration(conn) {
        conn.execute("DROP TABLE IF EXISTS note_tags", [])
            .map_err(|e| e.to_string())?;
    }

    conn.execute_batch(&format!(
        "CREATE TABLE IF NOT EXISTS notes (
            path TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            mtime_ms INTEGER NOT NULL,
            size_bytes INTEGER NOT NULL
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
            {EXPECTED_FTS_COLUMNS},
            tokenize='unicode61 remove_diacritics 2'
        );

        CREATE TABLE IF NOT EXISTS outlinks (
            source_path TEXT NOT NULL,
            target_path TEXT NOT NULL,
            PRIMARY KEY (source_path, target_path)
        );

        CREATE INDEX IF NOT EXISTS idx_outlinks_target ON outlinks(target_path);

        CREATE TABLE IF NOT EXISTS note_properties (
            path TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            type TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_note_properties_path ON note_properties(path);
        CREATE INDEX IF NOT EXISTS idx_note_properties_key ON note_properties(key);

        CREATE TABLE IF NOT EXISTS note_inline_tags (
            path TEXT NOT NULL,
            tag TEXT NOT NULL,
            line INTEGER NOT NULL,
            source TEXT NOT NULL,
            PRIMARY KEY (path, tag, line),
            FOREIGN KEY (path) REFERENCES notes(path) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_inline_tags_tag ON note_inline_tags(tag);
        CREATE INDEX IF NOT EXISTS idx_inline_tags_source ON note_inline_tags(source);

        CREATE TABLE IF NOT EXISTS note_sections (
            path TEXT NOT NULL,
            heading_id TEXT NOT NULL,
            level INTEGER NOT NULL,
            title TEXT NOT NULL,
            start_line INTEGER NOT NULL,
            end_line INTEGER NOT NULL,
            word_count INTEGER NOT NULL,
            PRIMARY KEY (path, heading_id),
            FOREIGN KEY (path) REFERENCES notes(path) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_note_sections_path ON note_sections(path);

        CREATE TABLE IF NOT EXISTS note_code_blocks (
            path TEXT NOT NULL,
            line INTEGER NOT NULL,
            language TEXT,
            length INTEGER NOT NULL,
            PRIMARY KEY (path, line),
            FOREIGN KEY (path) REFERENCES notes(path) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_note_code_blocks_lang ON note_code_blocks(language);

        CREATE TABLE IF NOT EXISTS property_registry (
            key TEXT PRIMARY KEY,
            inferred_type TEXT NOT NULL,
            note_count INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL,
            text TEXT NOT NULL,
            status TEXT NOT NULL,
            due_date TEXT,
            line_number INTEGER NOT NULL,
            section TEXT,
            FOREIGN KEY(path) REFERENCES notes(path) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_path ON tasks(path);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

        CREATE TABLE IF NOT EXISTS note_headings (
            note_path TEXT NOT NULL,
            level INTEGER NOT NULL,
            text TEXT NOT NULL,
            line INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_note_headings_path ON note_headings(note_path);

        CREATE TABLE IF NOT EXISTS note_links (
            source_path TEXT NOT NULL,
            target_path TEXT NOT NULL,
            link_text TEXT,
            link_type TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_note_links_source ON note_links(source_path);
        CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_path);

        CREATE TABLE IF NOT EXISTS index_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "
    ))
    .map_err(|e| e.to_string())?;

    for col in &[
        "word_count INTEGER DEFAULT 0",
        "char_count INTEGER DEFAULT 0",
        "heading_count INTEGER DEFAULT 0",
        "outlink_count INTEGER DEFAULT 0",
        "reading_time_secs INTEGER DEFAULT 0",
        "last_indexed_at INTEGER DEFAULT 0",
        "file_type TEXT DEFAULT 'markdown'",
        "page_offsets TEXT DEFAULT NULL",
        "source TEXT DEFAULT 'vault'",
    ] {
        let _ = conn.execute_batch(&format!("ALTER TABLE notes ADD COLUMN {col}"));
    }

    for col in &["section_heading TEXT", "target_anchor TEXT"] {
        let _ = conn.execute_batch(&format!("ALTER TABLE note_links ADD COLUMN {col}"));
    }

    Ok(())
}

pub fn open_search_db(app: &AppHandle, vault_id: &str) -> Result<Connection, String> {
    let path = db_path(app, vault_id)?;
    let conn = open_search_db_at_path(&path)?;
    try_init_vector_tables(&conn);
    Ok(conn)
}

fn try_init_vector_tables(conn: &Connection) {
    if let Err(e) = vector_db::init_vector_schema(conn) {
        log::warn!("Failed to init vector schema: {e}");
    }
}

pub fn open_search_db_at_path(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_millis(5000))
        .map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-8000; PRAGMA mmap_size=268435456;")
        .map_err(|e| e.to_string())?;
    init_schema(&conn)?;
    Ok(conn)
}

pub fn upsert_note_simple(
    conn: &Connection,
    meta: &IndexNoteMeta,
    raw_markdown: &str,
) -> Result<(), String> {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let file_type = meta.file_type.as_deref().unwrap_or("markdown");
    let word_count = raw_markdown.split_whitespace().count() as i64;
    let char_count = raw_markdown.len() as i64;

    conn.execute(
        "REPLACE INTO notes (path, title, mtime_ms, size_bytes, word_count, char_count, heading_count, reading_time_secs, last_indexed_at, file_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, ?7, ?8)",
        params![meta.path, meta.title, meta.mtime_ms, meta.size_bytes, word_count, char_count, now_ms, file_type],
    )
    .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM notes_fts WHERE path = ?1", params![meta.path])
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO notes_fts (title, name, path, body) VALUES (?1, ?2, ?3, ?4)",
        params![meta.title, meta.name, meta.path, raw_markdown],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn upsert_note(conn: &Connection, meta: &IndexNoteMeta, body: &str) -> Result<(), String> {
    conn.execute_batch("BEGIN IMMEDIATE")
        .map_err(|e| e.to_string())?;
    let result = upsert_note_simple(conn, meta, body);
    match result {
        Ok(()) => conn.execute_batch("COMMIT").map_err(|e| e.to_string()),
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

fn upsert_note_inner(conn: &Connection, meta: &IndexNoteMeta, body: &str) -> Result<(), String> {
    upsert_note_simple(conn, meta, body)
}

fn upsert_plain_content(
    conn: &Connection,
    meta: &IndexNoteMeta,
    body: &str,
    page_offsets: &[usize],
) -> Result<(), String> {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let file_type = meta.file_type.as_deref().unwrap_or("text");
    let source = meta.source.as_deref().unwrap_or("vault");
    let word_count = body.split_whitespace().count() as i64;
    let char_count = body.len() as i64;
    let offsets_json: Option<String> = if page_offsets.is_empty() {
        None
    } else {
        serde_json::to_string(page_offsets).ok()
    };

    conn.execute(
        "REPLACE INTO notes (path, title, mtime_ms, size_bytes, word_count, char_count, heading_count, reading_time_secs, last_indexed_at, file_type, page_offsets, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, ?7, ?8, ?9, ?10)",
        params![meta.path, meta.title, meta.mtime_ms, meta.size_bytes, word_count, char_count, now_ms, file_type, offsets_json, source],
    )
    .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM notes_fts WHERE path = ?1", params![meta.path])
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO notes_fts (title, name, path, body) VALUES (?1, ?2, ?3, ?4)",
        params![meta.title, meta.name, meta.path, body],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn upsert_linked_content(
    conn: &Connection,
    source_id: &str,
    file_path: &str,
    title: &str,
    body: &str,
    page_offsets: &[usize],
    file_type: &str,
    modified_at: u64,
) -> Result<IndexNoteMeta, String> {
    let synthetic_path = format!("linked:{source_id}/{}", file_name_from_path(file_path));
    let name = file_stem_string(Path::new(file_path));
    let meta = IndexNoteMeta {
        id: synthetic_path.clone(),
        path: synthetic_path,
        title: title.to_string(),
        name,
        mtime_ms: modified_at as i64,
        size_bytes: body.len() as i64,
        file_type: Some(file_type.to_string()),
        source: Some(format!("linked:{source_id}")),
    };
    upsert_plain_content(conn, &meta, body, page_offsets)?;
    Ok(meta)
}

pub fn remove_linked_content(
    conn: &Connection,
    source_id: &str,
    file_path: &str,
) -> Result<(), String> {
    let synthetic_path = format!("linked:{source_id}/{}", file_name_from_path(file_path));
    remove_note(conn, &synthetic_path)
}

pub fn clear_linked_source(conn: &Connection, source_id: &str) -> Result<(), String> {
    let prefix = format!("linked:{source_id}/");
    remove_notes_by_prefix(conn, &prefix)
}

fn file_name_from_path(path: &str) -> &str {
    Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(path)
}

pub fn remove_note(conn: &Connection, path: &str) -> Result<(), String> {
    conn.execute("DELETE FROM notes WHERE path = ?1", params![path])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes_fts WHERE path = ?1", params![path])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM outlinks WHERE source_path = ?1", params![path])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM note_properties WHERE path = ?1", params![path])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM note_inline_tags WHERE path = ?1",
        params![path],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM note_sections WHERE path = ?1", params![path])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM note_code_blocks WHERE path = ?1",
        params![path],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tasks WHERE path = ?1", params![path])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM note_headings WHERE note_path = ?1",
        params![path],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM note_links WHERE source_path = ?1",
        params![path],
    )
    .map_err(|e| e.to_string())?;
    if let Err(e) = vector_db::remove_embedding(conn, path) {
        log::debug!("vector_db::remove_embedding skipped: {e}");
    }
    Ok(())
}

pub fn remove_notes(conn: &Connection, paths: &[String]) -> Result<(), String> {
    for path in paths {
        remove_note(conn, path)?;
    }
    Ok(())
}

fn like_prefix_pattern(prefix: &str) -> String {
    let escaped = prefix
        .replace('\\', r"\\")
        .replace('%', r"\%")
        .replace('_', r"\_");
    format!("{escaped}%")
}

pub fn remove_notes_by_prefix(conn: &Connection, prefix: &str) -> Result<(), String> {
    let like_pattern = like_prefix_pattern(prefix);
    conn.execute_batch("BEGIN IMMEDIATE")
        .map_err(|e| e.to_string())?;
    let result = conn
        .execute(
            "DELETE FROM notes WHERE path LIKE ?1 ESCAPE '\\'",
            params![like_pattern],
        )
        .and_then(|_| {
            conn.execute(
                "DELETE FROM notes_fts WHERE path LIKE ?1 ESCAPE '\\'",
                params![like_pattern],
            )
        })
        .and_then(|_| {
            conn.execute(
                "DELETE FROM outlinks WHERE source_path LIKE ?1 ESCAPE '\\'",
                params![like_pattern],
            )
        })
        .and_then(|_| {
            conn.execute(
                "DELETE FROM note_properties WHERE path LIKE ?1 ESCAPE '\\'",
                params![like_pattern],
            )
        })
        .and_then(|_| {
            conn.execute(
                "DELETE FROM note_inline_tags WHERE path LIKE ?1 ESCAPE '\\'",
                params![like_pattern],
            )
        })
        .and_then(|_| {
            conn.execute(
                "DELETE FROM note_sections WHERE path LIKE ?1 ESCAPE '\\'",
                params![like_pattern],
            )
        })
        .and_then(|_| {
            conn.execute(
                "DELETE FROM note_code_blocks WHERE path LIKE ?1 ESCAPE '\\'",
                params![like_pattern],
            )
        })
        .and_then(|_| {
            conn.execute(
                "DELETE FROM tasks WHERE path LIKE ?1 ESCAPE '\\'",
                params![like_pattern],
            )
        })
        .and_then(|_| {
            conn.execute(
                "DELETE FROM note_headings WHERE note_path LIKE ?1 ESCAPE '\\'",
                params![like_pattern],
            )
        })
        .and_then(|_| {
            conn.execute(
                "DELETE FROM note_links WHERE source_path LIKE ?1 ESCAPE '\\'",
                params![like_pattern],
            )
        })
        .map(|_| ())
        .map_err(|e| e.to_string());

    match result {
        Ok(_) => {
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            if let Err(e) = vector_db::remove_embeddings_by_prefix(conn, prefix) {
                log::debug!("vector_db::remove_embeddings_by_prefix skipped: {e}");
            }
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

pub fn list_note_paths_by_prefix(conn: &Connection, prefix: &str) -> Result<Vec<String>, String> {
    let like_pattern = like_prefix_pattern(prefix);
    let mut stmt = conn
        .prepare(
            "SELECT path
             FROM notes
             WHERE path LIKE ?1 ESCAPE '\\'
             ORDER BY path",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![like_pattern], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
pub struct IndexResult {
    pub total: usize,
    pub indexed: usize,
    pub vault_stats: Option<VaultScanStats>,
}

pub struct SyncPlan {
    pub added: Vec<PathBuf>,
    pub modified: Vec<PathBuf>,
    pub removed: Vec<String>,
    pub unchanged: usize,
}

pub fn get_cached_titles(
    conn: &Connection,
    paths: &[String],
) -> Result<HashMap<String, String>, String> {
    if paths.is_empty() {
        return Ok(HashMap::new());
    }

    let placeholders: Vec<&str> = paths.iter().map(|_| "?").collect();
    let sql = format!(
        "SELECT path, title FROM notes WHERE path IN ({})",
        placeholders.join(",")
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let params: Vec<&dyn rusqlite::types::ToSql> = paths
        .iter()
        .map(|p| p as &dyn rusqlite::types::ToSql)
        .collect();

    let rows = stmt
        .query_map(params.as_slice(), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut map = HashMap::with_capacity(paths.len());
    for row in rows {
        let (path, title) = row.map_err(|e| e.to_string())?;
        map.insert(path, title);
    }
    Ok(map)
}

pub fn get_manifest(conn: &Connection) -> Result<BTreeMap<String, (i64, i64)>, String> {
    let mut stmt = conn
        .prepare("SELECT path, mtime_ms, size_bytes FROM notes")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut map = BTreeMap::new();
    for row in rows {
        let (path, mtime, size) = row.map_err(|e| e.to_string())?;
        map.insert(path, (mtime, size));
    }
    Ok(map)
}

pub fn compute_sync_plan(
    vault_root: &Path,
    manifest: &BTreeMap<String, (i64, i64)>,
    disk_files: &[PathBuf],
) -> SyncPlan {
    let mut added = Vec::new();
    let mut modified = Vec::new();
    let mut unchanged: usize = 0;

    let mut seen_paths: BTreeSet<String> = BTreeSet::new();

    for abs in disk_files {
        let rel = match abs.strip_prefix(vault_root) {
            Ok(r) => storage::normalize_relative_path(r),
            Err(_) => continue,
        };

        seen_paths.insert(rel.clone());

        match manifest.get(&rel) {
            None => added.push(abs.clone()),
            Some(&(db_mtime, db_size)) => match notes_service::file_meta(abs) {
                Ok((disk_mtime, disk_size)) => {
                    if disk_mtime != db_mtime || disk_size != db_size {
                        modified.push(abs.clone());
                    } else {
                        unchanged += 1;
                    }
                }
                Err(_) => modified.push(abs.clone()),
            },
        }
    }

    let removed: Vec<String> = manifest
        .keys()
        .filter(|p| !seen_paths.contains(p.as_str()))
        .cloned()
        .collect();

    SyncPlan {
        added,
        modified,
        removed,
        unchanged,
    }
}

const BATCH_SIZE: usize = 100;

fn resolve_batch_outlinks(
    conn: &Connection,
    pending_links: &[(String, Vec<String>)],
) -> Result<(), String> {
    if pending_links.is_empty() {
        return Ok(());
    }

    for (source, targets) in pending_links {
        let mut resolved: BTreeSet<String> = BTreeSet::new();
        for target in targets {
            if *target != *source {
                resolved.insert(target.clone());
            }
        }
        set_outlinks(conn, source, &resolved.into_iter().collect::<Vec<_>>())?;
    }

    Ok(())
}

pub fn rebuild_index(
    app: Option<&tauri::AppHandle>,
    vault_id: &str,
    conn: &Connection,
    vault_root: &Path,
    cancel: &AtomicBool,
    on_progress: &dyn Fn(usize, usize),
    yield_fn: &mut dyn FnMut(),
) -> Result<IndexResult, String> {
    conn.execute("DELETE FROM notes", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes_fts", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM outlinks", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM note_headings", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM note_links", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM note_inline_tags", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM note_sections", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM note_code_blocks", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tasks", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM note_properties", [])
        .map_err(|e| e.to_string())?;

    let paths = list_indexable_files(app, vault_id, vault_root)?;
    let total = paths.len();
    on_progress(0, total);

    let mut indexed: usize = 0;
    for batch in paths.chunks(BATCH_SIZE) {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        let mut pending_links: Vec<(String, Vec<String>)> = Vec::new();

        conn.execute_batch("BEGIN IMMEDIATE")
            .map_err(|e| e.to_string())?;

        for abs in batch {
            indexed += 1;
            let mut meta = match extract_file_meta(abs, vault_root) {
                Ok(m) => m,
                Err(e) => {
                    log::warn!("skip {}: {}", abs.display(), e);
                    continue;
                }
            };

            index_single_file_from_disk(conn, abs, &mut meta, &mut pending_links)?;
        }

        resolve_batch_outlinks(conn, &pending_links)?;
        conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
        on_progress(indexed, total);
        yield_fn();
    }

    Ok(IndexResult {
        total,
        indexed,
        vault_stats: None,
    })
}

fn index_single_file_from_disk(
    conn: &Connection,
    abs: &Path,
    meta: &mut IndexNoteMeta,
    pending_links: &mut Vec<(String, Vec<String>)>,
) -> Result<(), String> {
    use crate::features::search::text_extractor::{classify_file, extract_content, FileCategory};

    let category = classify_file(abs);
    meta.file_type = Some(category.as_str().to_string());

    match category {
        FileCategory::Markdown | FileCategory::Canvas => {
            let raw = io_utils::read_file_to_string(abs).unwrap_or_default();
            index_single_file_text(conn, abs, &raw, meta, pending_links)
        }
        FileCategory::Pdf => {
            let bytes = std::fs::read(abs).unwrap_or_default();
            let content = extract_content(abs, &bytes);
            if content.body.is_empty() {
                log::warn!("PDF extraction empty for {}", abs.display());
            }
            upsert_plain_content(conn, meta, &content.body, &content.page_offsets)?;
            pending_links.push((meta.path.clone(), vec![]));
            Ok(())
        }
        FileCategory::Code | FileCategory::Text => {
            let bytes = std::fs::read(abs).unwrap_or_default();
            let content = extract_content(abs, &bytes);
            upsert_plain_content(conn, meta, &content.body, &content.page_offsets)?;
            pending_links.push((meta.path.clone(), vec![]));
            Ok(())
        }
        FileCategory::Binary => {
            upsert_plain_content(conn, meta, "", &[])?;
            pending_links.push((meta.path.clone(), vec![]));
            Ok(())
        }
    }
}

fn index_single_file_text(
    conn: &Connection,
    abs: &Path,
    raw: &str,
    meta: &mut IndexNoteMeta,
    pending_links: &mut Vec<(String, Vec<String>)>,
) -> Result<(), String> {
    if is_canvas_file(abs) {
        let body = extract_indexable_body(abs, raw);
        upsert_note_inner(conn, meta, &body)?;
        let targets = crate::features::canvas::canvas_link_extractor::extract_all_link_targets(raw)
            .unwrap_or_default();
        pending_links.push((meta.path.clone(), targets));
    } else if abs.extension().and_then(|x| x.to_str()) == Some("md") {
        meta.title = extract_title_from_markdown(raw).unwrap_or_else(|| meta.name.clone());
        upsert_note_inner(conn, meta, raw)?;
        pending_links.push((meta.path.clone(), vec![]));
        let tasks = crate::features::tasks::service::extract_tasks(&meta.path, raw);
        crate::features::tasks::service::save_tasks(conn, &meta.path, &tasks)?;
        let props = extract_frontmatter_properties(raw);
        save_properties(conn, &meta.path, &props)?;
    }
    Ok(())
}

pub fn sync_index(
    app: Option<&tauri::AppHandle>,
    vault_id: &str,
    conn: &Connection,
    vault_root: &Path,
    cancel: &AtomicBool,
    on_progress: &dyn Fn(usize, usize),
    yield_fn: &mut dyn FnMut(),
) -> Result<IndexResult, String> {
    let manifest = get_manifest(conn).unwrap_or_else(|e| {
        log::warn!("sync_index: get_manifest failed, treating as empty: {e}");
        BTreeMap::new()
    });
    log::info!(
        "sync_index: manifest has {} entries, vault_root={}",
        manifest.len(),
        vault_root.display()
    );
    let scan = scan_vault(app, vault_id, vault_root)?;
    let vault_stats = Some(scan.stats);
    let disk_files = scan.indexable_files;
    log::info!("sync_index: scanned {} disk files", disk_files.len());
    let plan = compute_sync_plan(vault_root, &manifest, &disk_files);

    let change_count = plan.added.len() + plan.modified.len() + plan.removed.len();

    if change_count == 0 {
        log::info!(
            "sync_index: no changes ({} files unchanged)",
            plan.unchanged
        );
        on_progress(0, 0);
        return Ok(IndexResult {
            total: plan.unchanged,
            indexed: 0,
            vault_stats,
        });
    }

    log::info!(
        "sync_index: {} added, {} modified, {} removed, {} unchanged",
        plan.added.len(),
        plan.modified.len(),
        plan.removed.len(),
        plan.unchanged
    );

    let total = plan.added.len() + plan.modified.len() + plan.removed.len();
    on_progress(0, total);
    let mut indexed: usize = 0;

    if !plan.removed.is_empty() {
        for batch in plan.removed.chunks(BATCH_SIZE) {
            if cancel.load(Ordering::Relaxed) {
                return Ok(IndexResult {
                    total: total + plan.unchanged,
                    indexed,
                    vault_stats,
                });
            }
            conn.execute_batch("BEGIN IMMEDIATE")
                .map_err(|e| e.to_string())?;
            for path in batch {
                remove_note(conn, path)?;
                indexed += 1;
            }
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            on_progress(indexed, total);
            yield_fn();
        }
    }

    let upsert_files: Vec<&PathBuf> = plan.added.iter().chain(plan.modified.iter()).collect();

    for batch in upsert_files.chunks(BATCH_SIZE) {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        let mut pending_links: Vec<(String, Vec<String>)> = Vec::new();

        conn.execute_batch("BEGIN IMMEDIATE")
            .map_err(|e| e.to_string())?;

        for abs in batch {
            indexed += 1;
            let mut meta = match extract_file_meta(abs, vault_root) {
                Ok(m) => m,
                Err(e) => {
                    log::warn!("skip {}: {}", abs.display(), e);
                    continue;
                }
            };

            index_single_file_from_disk(conn, abs, &mut meta, &mut pending_links)?;
        }

        resolve_batch_outlinks(conn, &pending_links)?;
        conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
        on_progress(indexed, total);
        yield_fn();
    }

    if let Ok(head) = resolve_git_head(vault_root) {
        let _ = set_index_meta(conn, "last_indexed_commit", &head);
    }

    Ok(IndexResult {
        total: total + plan.unchanged,
        indexed,
        vault_stats,
    })
}

pub fn sync_index_paths(
    _app: Option<&tauri::AppHandle>,
    _vault_id: &str,
    conn: &Connection,
    vault_root: &Path,
    cancel: &AtomicBool,
    on_progress: &dyn Fn(usize, usize),
    _yield_fn: &mut dyn FnMut(),
    changed_paths: &[String],
    removed_paths: &[String],
) -> Result<IndexResult, String> {
    let total = changed_paths.len() + removed_paths.len();
    if total == 0 {
        on_progress(0, 0);
        return Ok(IndexResult {
            total: 0,
            indexed: 0,
            vault_stats: None,
        });
    }

    on_progress(0, total);
    let mut indexed: usize = 0;

    if !removed_paths.is_empty() {
        conn.execute_batch("BEGIN IMMEDIATE")
            .map_err(|e| e.to_string())?;
        for path in removed_paths {
            if cancel.load(Ordering::Relaxed) {
                conn.execute_batch("ROLLBACK").ok();
                return Ok(IndexResult {
                    total,
                    indexed,
                    vault_stats: None,
                });
            }
            remove_note(conn, path)?;
            indexed += 1;
        }
        conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
        on_progress(indexed, total);
    }

    if !changed_paths.is_empty() {
        let mut pending_links: Vec<(String, Vec<String>)> = Vec::new();
        conn.execute_batch("BEGIN IMMEDIATE")
            .map_err(|e| e.to_string())?;

        for rel_path in changed_paths {
            if cancel.load(Ordering::Relaxed) {
                conn.execute_batch("ROLLBACK").ok();
                break;
            }
            let abs = vault_root.join(rel_path);
            if !abs.exists() {
                remove_note(conn, rel_path)?;
                indexed += 1;
                continue;
            }
            let mut meta = match extract_file_meta(&abs, vault_root) {
                Ok(m) => m,
                Err(e) => {
                    log::warn!("sync_paths: skip {}: {}", abs.display(), e);
                    indexed += 1;
                    continue;
                }
            };
            index_single_file_from_disk(conn, &abs, &mut meta, &mut pending_links)?;
            indexed += 1;
        }

        resolve_batch_outlinks(conn, &pending_links)?;
        conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
        on_progress(indexed, total);
    }

    Ok(IndexResult {
        total,
        indexed,
        vault_stats: None,
    })
}

fn resolve_git_head(vault_root: &Path) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(vault_root)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("not a git repo".to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn get_fts_body(conn: &Connection, path: &str) -> Option<String> {
    conn.query_row(
        "SELECT body FROM notes_fts WHERE path = ?1",
        params![path],
        |row| row.get(0),
    )
    .ok()
}

pub fn get_all_notes_from_db(conn: &Connection) -> Result<BTreeMap<String, IndexNoteMeta>, String> {
    let mut stmt = conn
        .prepare("SELECT path, title, mtime_ms, size_bytes, file_type FROM notes")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| note_meta_from_row_cols(row, Some(4)))
        .map_err(|e| e.to_string())?;
    let mut map = BTreeMap::new();
    for row in rows {
        let meta = row.map_err(|e| e.to_string())?;
        map.insert(meta.path.clone(), meta);
    }
    Ok(map)
}

pub fn get_all_graph_edges(conn: &Connection) -> Result<Vec<(String, String)>, String> {
    let sql = "SELECT DISTINCT source_path, target_path
               FROM outlinks
               WHERE source_path IN (SELECT path FROM notes)
                 AND target_path IN (SELECT path FROM notes)
                 AND source_path != target_path";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let source: String = row.get(0)?;
            let target: String = row.get(1)?;
            Ok((source, target))
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn get_all_notes_chunked(
    conn: &Connection,
    chunk_size: usize,
    callback: &dyn Fn(Vec<IndexNoteMeta>, usize),
) -> Result<usize, String> {
    let total = get_note_count(conn)?;
    let mut stmt = conn
        .prepare("SELECT path, title, mtime_ms, size_bytes, file_type FROM notes")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| note_meta_from_row_cols(row, Some(4)))
        .map_err(|e| e.to_string())?;

    let mut chunk = Vec::with_capacity(chunk_size);
    let mut emitted = 0usize;
    for row in rows {
        let meta = row.map_err(|e| e.to_string())?;
        chunk.push(meta);
        if chunk.len() >= chunk_size {
            emitted += chunk.len();
            callback(std::mem::take(&mut chunk), emitted);
            chunk = Vec::with_capacity(chunk_size);
        }
    }
    if !chunk.is_empty() {
        emitted += chunk.len();
        callback(chunk, emitted);
    }
    Ok(total)
}

pub fn get_all_graph_edges_chunked(
    conn: &Connection,
    chunk_size: usize,
    callback: &dyn Fn(Vec<(String, String)>, usize),
) -> Result<usize, String> {
    let sql = "SELECT DISTINCT source_path, target_path
               FROM outlinks
               WHERE source_path IN (SELECT path FROM notes)
                 AND target_path IN (SELECT path FROM notes)
                 AND source_path != target_path";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let source: String = row.get(0)?;
            let target: String = row.get(1)?;
            Ok((source, target))
        })
        .map_err(|e| e.to_string())?;

    let mut chunk = Vec::with_capacity(chunk_size);
    let mut emitted = 0usize;
    for row in rows {
        let pair = row.map_err(|e| e.to_string())?;
        chunk.push(pair);
        if chunk.len() >= chunk_size {
            emitted += chunk.len();
            callback(std::mem::take(&mut chunk), emitted);
            chunk = Vec::with_capacity(chunk_size);
        }
    }
    if !chunk.is_empty() {
        emitted += chunk.len();
        callback(chunk, emitted);
    }
    Ok(emitted)
}

fn escape_fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .map(|term| format!("\"{}\"", term.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" ")
}

fn escape_fts_prefix_query(query: &str) -> String {
    query
        .split_whitespace()
        .filter_map(|term| {
            let clean: String = term
                .chars()
                .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
                .collect();
            if clean.is_empty() {
                return None;
            }
            Some(format!("\"{clean}\"*"))
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn like_contains_pattern(query: &str) -> String {
    let escaped = query
        .trim()
        .to_lowercase()
        .replace('\\', r"\\")
        .replace('%', r"\%")
        .replace('_', r"\_");
    format!("%{escaped}%")
}

fn note_meta_from_row_cols(
    row: &rusqlite::Row,
    file_type_col: Option<usize>,
) -> rusqlite::Result<IndexNoteMeta> {
    let path: String = row.get(0)?;
    let title: String = row.get(1)?;
    let name = file_stem_string(Path::new(&path));
    let file_type: Option<String> = file_type_col.and_then(|col| row.get(col).ok());
    Ok(IndexNoteMeta {
        id: path.clone(),
        path,
        title,
        name,
        mtime_ms: row.get(2)?,
        size_bytes: row.get(3)?,
        file_type,
        source: None,
    })
}

fn note_meta_with_stats_from_row(
    row: &rusqlite::Row,
) -> rusqlite::Result<(IndexNoteMeta, crate::features::search::model::NoteStats)> {
    let path: String = row.get(0)?;
    let title: String = row.get(1)?;
    let name = file_stem_string(Path::new(&path));
    let meta = IndexNoteMeta {
        id: path.clone(),
        path,
        title,
        name,
        mtime_ms: row.get(2)?,
        size_bytes: row.get(3)?,
        file_type: row.get(10).ok(),
        source: None,
    };
    let stats = crate::features::search::model::NoteStats {
        word_count: row.get(4).unwrap_or(0),
        char_count: row.get(5).unwrap_or(0),
        heading_count: row.get(6).unwrap_or(0),
        outlink_count: row.get(7).unwrap_or(0),
        reading_time_secs: row.get(8).unwrap_or(0),
        task_count: row.get(11).unwrap_or(0),
        tasks_done: row.get(12).unwrap_or(0),
        tasks_todo: row.get(13).unwrap_or(0),
        next_due_date: row.get(14).ok().flatten(),
        last_indexed_at: row.get(9).unwrap_or(0),
    };
    Ok((meta, stats))
}

pub fn search(
    conn: &Connection,
    query: &str,
    scope: SearchScope,
    limit: usize,
    include_linked_sources: bool,
) -> Result<Vec<SearchHit>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let escaped = escape_fts_query(trimmed);
    let match_expr = match scope {
        SearchScope::All => escaped,
        SearchScope::Title => format!("title : {escaped}"),
        SearchScope::Path => format!("path : {escaped}"),
        SearchScope::Content => format!("body : {escaped}"),
    };

    let linked_filter = if include_linked_sources {
        ""
    } else {
        " AND (n.source IS NULL OR n.source NOT LIKE 'linked:%')"
    };
    let sql = format!(
        "SELECT n.path, n.title, n.mtime_ms, n.size_bytes,
                snippet(notes_fts, 3, '<b>', '</b>', '...', 30) as snippet,
                bm25(notes_fts, 10.0, 12.0, 5.0, 1.0) as rank,
                n.file_type,
                n.page_offsets,
                notes_fts.body,
                n.source
         FROM notes_fts
         JOIN notes n ON n.path = notes_fts.path
         WHERE notes_fts MATCH ?1{linked_filter}
         ORDER BY rank
         LIMIT ?2"
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![match_expr, limit], |row| {
            let snippet: Option<String> = row.get(4)?;
            let offsets_json: Option<String> = row.get(7)?;
            let body: Option<String> = row.get(8)?;
            let source: Option<String> = row.get(9)?;
            let snippet_page = resolve_snippet_page_from_json(
                snippet.as_deref(),
                body.as_deref(),
                offsets_json.as_deref(),
            );
            let mut note = note_meta_from_row_cols(row, Some(6))?;
            note.source = source;
            Ok(SearchHit {
                note,
                score: row.get(5)?,
                snippet,
                snippet_page,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn suggest(conn: &Connection, query: &str, limit: usize) -> Result<Vec<SuggestionHit>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let escaped = escape_fts_prefix_query(trimmed);
    if escaped.is_empty() {
        return Ok(Vec::new());
    }
    let match_expr = format!("{{title name path}} : {escaped}");

    let sql = "SELECT n.path, n.title, n.mtime_ms, n.size_bytes,
                      bm25(notes_fts, 15.0, 20.0, 5.0, 0.0) as rank,
                      n.file_type
               FROM notes_fts
               JOIN notes n ON n.path = notes_fts.path
               WHERE notes_fts MATCH ?1
               ORDER BY rank
               LIMIT ?2";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![match_expr, limit], |row| {
            Ok(SuggestionHit {
                note: note_meta_from_row_cols(row, Some(5))?,
                score: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn fuzzy_suggest(
    conn: &Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<SuggestionHit>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    // Pre-filter with LIKE on the first query character to avoid full table scan.
    // skim's fuzzy matching requires at least the first char to appear somewhere
    // in the target, so this is safe to filter on.
    let first_char = trimmed.chars().next().unwrap().to_lowercase().to_string();
    let like_pattern = format!("%{}%", first_char.replace('%', r"\%").replace('_', r"\_"));
    let sql = "SELECT path, title, mtime_ms, size_bytes, file_type FROM notes
               WHERE LOWER(title) LIKE ?1 ESCAPE '\\' OR LOWER(path) LIKE ?1 ESCAPE '\\'";
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;

    let matcher = SkimMatcherV2::default();
    let mut scored: Vec<SuggestionHit> = Vec::new();

    let rows = stmt
        .query_map(params![like_pattern], |row| {
            let path: String = row.get(0)?;
            let title: String = row.get(1)?;
            let name = file_stem_string(Path::new(&path));
            let mtime_ms: i64 = row.get(2)?;
            let size_bytes: i64 = row.get(3)?;
            let file_type: Option<String> = row.get(4).ok();
            Ok((path, title, name, mtime_ms, size_bytes, file_type))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (path, title, name, mtime_ms, size_bytes, file_type) =
            row.map_err(|e| e.to_string())?;

        let best_score = [&title, &name, &path]
            .iter()
            .filter_map(|target| matcher.fuzzy_match(target, trimmed))
            .max()
            .unwrap_or(0);

        if best_score > 0 {
            scored.push(SuggestionHit {
                note: IndexNoteMeta {
                    id: path.clone(),
                    path,
                    title,
                    name,
                    mtime_ms,
                    size_bytes,
                    file_type,
                    source: None,
                },
                score: best_score as f64,
            });
        }
    }

    scored.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    scored.truncate(limit);
    Ok(scored)
}

pub fn suggest_planned(
    conn: &Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<PlannedSuggestionHit>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let pattern = like_contains_pattern(trimmed);
    let sql = "SELECT o.target_path, COUNT(*) as ref_count
               FROM outlinks o
               LEFT JOIN notes n ON n.path = o.target_path
               WHERE n.path IS NULL
                 AND lower(o.target_path) LIKE ?1 ESCAPE '\\'
               GROUP BY o.target_path
               ORDER BY ref_count DESC, o.target_path ASC
               LIMIT ?2";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![pattern, limit], |row| {
            Ok(PlannedSuggestionHit {
                target_path: row.get(0)?,
                ref_count: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn set_outlinks(conn: &Connection, source: &str, targets: &[String]) -> Result<(), String> {
    conn.execute(
        "DELETE FROM outlinks WHERE source_path = ?1",
        params![source],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("INSERT INTO outlinks (source_path, target_path) VALUES (?1, ?2)")
        .map_err(|e| e.to_string())?;

    for target in targets {
        stmt.execute(params![source, target])
            .map_err(|e| e.to_string())?;
    }

    update_outlink_count(conn, source)?;

    Ok(())
}

pub fn update_outlink_count(conn: &Connection, path: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE notes SET outlink_count = (SELECT COUNT(*) FROM outlinks WHERE source_path = ?1) WHERE path = ?1",
        params![path],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_note_stats(
    conn: &Connection,
    path: &str,
) -> Result<crate::features::search::model::NoteStats, String> {
    conn.query_row(
        "SELECT word_count, char_count, heading_count, outlink_count, reading_time_secs, last_indexed_at FROM notes WHERE path = ?1",
        params![path],
        |row| Ok(crate::features::search::model::NoteStats {
            word_count: row.get(0)?,
            char_count: row.get(1)?,
            heading_count: row.get(2)?,
            outlink_count: row.get(3)?,
            reading_time_secs: row.get(4)?,
            task_count: 0,
            tasks_done: 0,
            tasks_todo: 0,
            next_due_date: None,
            last_indexed_at: row.get(5)?,
        }),
    )
    .map_err(|e| e.to_string())
}

#[allow(dead_code)]
pub fn get_index_meta(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM index_meta WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .ok()
}

pub fn set_index_meta(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "REPLACE INTO index_meta (key, value) VALUES (?1, ?2)",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_note_count(conn: &Connection) -> Result<usize, String> {
    conn.query_row("SELECT COUNT(*) FROM notes", [], |row| row.get::<_, i64>(0))
        .map(|c| c as usize)
        .map_err(|e| e.to_string())
}

pub fn get_note_meta(conn: &Connection, path: &str) -> Result<Option<IndexNoteMeta>, String> {
    let sql = "SELECT path, title, mtime_ms, size_bytes, file_type
               FROM notes
               WHERE path = ?1";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    match stmt.query_row(params![path], |row| note_meta_from_row_cols(row, Some(4))) {
        Ok(note) => Ok(Some(note)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub fn get_outlinks(conn: &Connection, path: &str) -> Result<Vec<IndexNoteMeta>, String> {
    let sql = "SELECT n.path, n.title, n.mtime_ms, n.size_bytes, n.file_type
               FROM outlinks o
               JOIN notes n ON n.path = o.target_path
               WHERE o.source_path = ?1
               ORDER BY n.path";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![path], |row| note_meta_from_row_cols(row, Some(4)))
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(path: &str, title: &str) -> IndexNoteMeta {
        IndexNoteMeta {
            id: path.to_string(),
            path: path.to_string(),
            title: title.to_string(),
            name: file_stem_string(Path::new(path)),
            mtime_ms: 100,
            size_bytes: 10,
            file_type: None,
            source: None,
        }
    }

    #[test]
    fn resolve_batch_outlinks_replaces_removed_links_with_empty_snapshot() {
        let conn = Connection::open_in_memory().expect("in-memory db should open");
        init_schema(&conn).expect("schema should initialize");

        let source = note("notes/source.md", "Source");
        let target = note("notes/target.md", "Target");
        upsert_note(&conn, &source, "body").expect("source should upsert");
        upsert_note(&conn, &target, "body").expect("target should upsert");
        set_outlinks(&conn, &source.path, &[target.path.clone()]).expect("outlinks should set");

        resolve_batch_outlinks(&conn, &[(source.path.clone(), Vec::new())])
            .expect("empty snapshot should clear old outlinks");

        let outlinks = get_outlinks(&conn, &source.path).expect("outlinks should load");
        assert!(outlinks.is_empty());
        let orphans = get_orphan_outlinks(&conn, &source.path).expect("orphans should load");
        assert!(orphans.is_empty());
    }

    #[test]
    fn upsert_note_computes_stats() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        init_schema(&conn).expect("schema");

        let meta = note("test.md", "Test");
        let body = "---\ntitle: Test\n---\n# Heading One\n\nSome words here today.\n\n## Heading Two\n\nMore content.";
        upsert_note(&conn, &meta, body).expect("upsert");

        let stats = get_note_stats(&conn, "test.md").expect("stats");
        assert_eq!(stats.heading_count, 0);
        assert!(stats.word_count > 0);
        assert!(stats.char_count > 0);
        assert!(stats.reading_time_secs >= 0);
        assert!(stats.last_indexed_at > 0);
    }

    #[test]
    fn upsert_note_stats_no_frontmatter() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        init_schema(&conn).expect("schema");

        let meta = note("plain.md", "Plain");
        let body = "Just some plain text with no frontmatter and no headings.";
        upsert_note(&conn, &meta, body).expect("upsert");

        let stats = get_note_stats(&conn, "plain.md").expect("stats");
        assert_eq!(stats.heading_count, 0);
        assert_eq!(stats.word_count, 10);
    }

    #[test]
    fn set_outlinks_updates_outlink_count() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        init_schema(&conn).expect("schema");

        let source = note("s.md", "S");
        let t1 = note("t1.md", "T1");
        let t2 = note("t2.md", "T2");
        upsert_note(&conn, &source, "body").expect("upsert source");
        upsert_note(&conn, &t1, "body").expect("upsert t1");
        upsert_note(&conn, &t2, "body").expect("upsert t2");

        set_outlinks(&conn, "s.md", &["t1.md".to_string(), "t2.md".to_string()])
            .expect("set outlinks");

        let stats = get_note_stats(&conn, "s.md").expect("stats");
        assert_eq!(stats.outlink_count, 2);
    }

    #[test]
    fn index_meta_roundtrip() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        init_schema(&conn).expect("schema");

        assert!(get_index_meta(&conn, "last_indexed_commit").is_none());

        set_index_meta(&conn, "last_indexed_commit", "abc123").expect("set");
        assert_eq!(
            get_index_meta(&conn, "last_indexed_commit"),
            Some("abc123".to_string())
        );

        set_index_meta(&conn, "last_indexed_commit", "def456").expect("overwrite");
        assert_eq!(
            get_index_meta(&conn, "last_indexed_commit"),
            Some("def456".to_string())
        );
    }

    fn open_mem_db() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db");
        init_schema(&conn).expect("schema");
        conn
    }

    fn insert_prop(conn: &Connection, path: &str, key: &str, value: &str, typ: &str) {
        conn.execute(
            "INSERT INTO note_properties (path, key, value, type) VALUES (?1, ?2, ?3, ?4)",
            params![path, key, value, typ],
        )
        .expect("insert prop");
    }

    fn insert_tag(conn: &Connection, path: &str, tag: &str, line: i64, source: &str) {
        conn.execute(
            "REPLACE INTO note_inline_tags (path, tag, line, source) VALUES (?1, ?2, ?3, ?4)",
            params![path, tag, line, source],
        )
        .expect("insert tag");
    }

    fn count_rows(conn: &Connection, table: &str, path: &str) -> usize {
        conn.query_row(
            &format!("SELECT COUNT(*) FROM {table} WHERE path = ?1"),
            params![path],
            |row| row.get(0),
        )
        .unwrap_or(0)
    }

    fn make_query(
        filters: Vec<crate::features::search::model::BaseFilter>,
        sort: Vec<crate::features::search::model::BaseSort>,
        limit: usize,
        offset: usize,
    ) -> crate::features::search::model::BaseQuery {
        crate::features::search::model::BaseQuery {
            filters,
            sort,
            limit,
            offset,
        }
    }

    fn filter(
        property: &str,
        operator: &str,
        value: &str,
    ) -> crate::features::search::model::BaseFilter {
        crate::features::search::model::BaseFilter {
            property: property.to_string(),
            operator: operator.to_string(),
            value: value.to_string(),
        }
    }

    fn sort(property: &str, descending: bool) -> crate::features::search::model::BaseSort {
        crate::features::search::model::BaseSort {
            property: property.to_string(),
            descending,
        }
    }

    #[test]
    fn remove_note_cleans_up_rows() {
        let conn = open_mem_db();
        let meta = note("notes/c.md", "Note C");
        upsert_note(&conn, &meta, "body").expect("upsert");
        insert_prop(&conn, "notes/c.md", "status", "done", "string");
        insert_tag(&conn, "notes/c.md", "x", 0, "frontmatter");

        remove_note(&conn, "notes/c.md").expect("remove");

        assert_eq!(count_rows(&conn, "note_properties", "notes/c.md"), 0);
        assert_eq!(count_rows(&conn, "note_inline_tags", "notes/c.md"), 0);
        let note_count: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE path = ?1",
                params!["notes/c.md"],
                |r| r.get(0),
            )
            .expect("count");
        assert_eq!(note_count, 0);
    }

    #[test]
    fn rename_note_path_updates_properties_and_tags() {
        let conn = open_mem_db();
        let meta = note("old/note.md", "Old Note");
        upsert_note(&conn, &meta, "body").expect("upsert");
        insert_prop(&conn, "old/note.md", "status", "draft", "string");
        insert_tag(&conn, "old/note.md", "renamed", 0, "frontmatter");

        rename_note_path(&conn, "old/note.md", "new/note.md").expect("rename");

        assert_eq!(count_rows(&conn, "note_properties", "old/note.md"), 0);
        assert_eq!(count_rows(&conn, "note_inline_tags", "old/note.md"), 0);
        assert_eq!(count_rows(&conn, "note_properties", "new/note.md"), 1);
        assert_eq!(count_rows(&conn, "note_inline_tags", "new/note.md"), 1);
    }

    #[test]
    fn rename_folder_paths_batch_updates_properties_and_tags() {
        let conn = open_mem_db();
        let a = note("folder/a.md", "A");
        let b = note("folder/b.md", "B");
        upsert_note(&conn, &a, "body a").expect("upsert a");
        upsert_note(&conn, &b, "body b").expect("upsert b");
        insert_prop(&conn, "folder/a.md", "status", "a", "string");
        insert_tag(&conn, "folder/a.md", "ta", 0, "frontmatter");
        insert_prop(&conn, "folder/b.md", "status", "b", "string");
        insert_tag(&conn, "folder/b.md", "tb", 0, "frontmatter");

        rename_folder_paths(&conn, "folder", "archive").expect("rename");

        assert_eq!(count_rows(&conn, "note_properties", "folder/a.md"), 0);
        assert_eq!(count_rows(&conn, "note_inline_tags", "folder/a.md"), 0);
        assert_eq!(count_rows(&conn, "note_properties", "archive/a.md"), 1);
        assert_eq!(count_rows(&conn, "note_inline_tags", "archive/a.md"), 1);
        assert_eq!(count_rows(&conn, "note_properties", "archive/b.md"), 1);
        assert_eq!(count_rows(&conn, "note_inline_tags", "archive/b.md"), 1);
    }

    #[test]
    fn list_all_properties_aggregates_by_key_and_type() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("p/a.md", "A"), "body a").expect("upsert a");
        upsert_note(&conn, &note("p/b.md", "B"), "body b").expect("upsert b");
        insert_prop(&conn, "p/a.md", "status", "active", "string");
        insert_prop(&conn, "p/a.md", "priority", "1", "number");
        insert_prop(&conn, "p/b.md", "status", "done", "string");

        let props = list_all_properties(&conn).expect("list");
        let status = props
            .iter()
            .find(|p| p.name == "status")
            .expect("status key");
        assert_eq!(status.property_type, "string");
        assert_eq!(status.count, 2);

        let priority = props
            .iter()
            .find(|p| p.name == "priority")
            .expect("priority key");
        assert_eq!(priority.property_type, "number");
        assert_eq!(priority.count, 1);
    }

    #[test]
    fn query_bases_no_filters_returns_all_notes() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("q/a.md", "A"), "body").expect("a");
        upsert_note(&conn, &note("q/b.md", "B"), "body").expect("b");
        upsert_note(&conn, &note("q/c.md", "C"), "body").expect("c");

        let result = query_bases(&conn, make_query(vec![], vec![], 100, 0)).expect("query");
        assert_eq!(result.total, 3);
        assert_eq!(result.rows.len(), 3);
    }

    #[test]
    fn query_bases_filter_by_tag() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("q/a.md", "A"), "body").expect("a");
        upsert_note(&conn, &note("q/b.md", "B"), "body").expect("b");
        insert_tag(&conn, "q/a.md", "rust", 0, "frontmatter");
        insert_tag(&conn, "q/b.md", "python", 0, "frontmatter");

        let result = query_bases(
            &conn,
            make_query(vec![filter("tag", "eq", "rust")], vec![], 100, 0),
        )
        .expect("query");
        assert_eq!(result.total, 1);
        assert_eq!(result.rows[0].note.path, "q/a.md");
    }

    #[test]
    fn query_bases_filter_by_property_equality() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("q/a.md", "A"), "body").expect("a");
        upsert_note(&conn, &note("q/b.md", "B"), "body").expect("b");
        insert_prop(&conn, "q/a.md", "status", "draft", "string");
        insert_prop(&conn, "q/b.md", "status", "done", "string");

        let result = query_bases(
            &conn,
            make_query(vec![filter("status", "eq", "draft")], vec![], 100, 0),
        )
        .expect("query");
        assert_eq!(result.total, 1);
        assert_eq!(result.rows[0].note.path, "q/a.md");
    }

    #[test]
    fn query_bases_filter_by_property_contains() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("q/a.md", "A"), "body").expect("a");
        upsert_note(&conn, &note("q/b.md", "B"), "body").expect("b");
        insert_prop(&conn, "q/a.md", "title_prop", "hello world", "string");
        insert_prop(&conn, "q/b.md", "title_prop", "goodbye", "string");

        let result = query_bases(
            &conn,
            make_query(
                vec![filter("title_prop", "contains", "hello")],
                vec![],
                100,
                0,
            ),
        )
        .expect("query");
        assert_eq!(result.total, 1);
        assert_eq!(result.rows[0].note.path, "q/a.md");
    }

    #[test]
    fn query_bases_filter_property_numeric_gt() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("q/a.md", "A"), "body").expect("a");
        upsert_note(&conn, &note("q/b.md", "B"), "body").expect("b");
        insert_prop(&conn, "q/a.md", "score", "10", "number");
        insert_prop(&conn, "q/b.md", "score", "5", "number");

        let result = query_bases(
            &conn,
            make_query(vec![filter("score", "gt", "7")], vec![], 100, 0),
        )
        .expect("query");
        assert_eq!(result.total, 1);
        assert_eq!(result.rows[0].note.path, "q/a.md");
    }

    #[test]
    fn query_bases_filter_property_numeric_lte() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("q/a.md", "A"), "body").expect("a");
        upsert_note(&conn, &note("q/b.md", "B"), "body").expect("b");
        upsert_note(&conn, &note("q/c.md", "C"), "body").expect("c");
        insert_prop(&conn, "q/a.md", "score", "3", "number");
        insert_prop(&conn, "q/b.md", "score", "7", "number");
        insert_prop(&conn, "q/c.md", "score", "10", "number");

        let result = query_bases(
            &conn,
            make_query(vec![filter("score", "lte", "7")], vec![], 100, 0),
        )
        .expect("query");
        assert_eq!(result.total, 2);
    }

    #[test]
    fn query_bases_filter_by_neq() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("q/a.md", "A"), "body").expect("a");
        upsert_note(&conn, &note("q/b.md", "B"), "body").expect("b");
        insert_prop(&conn, "q/a.md", "status", "draft", "string");
        insert_prop(&conn, "q/b.md", "status", "done", "string");

        let result = query_bases(
            &conn,
            make_query(vec![filter("status", "neq", "draft")], vec![], 100, 0),
        )
        .expect("query");
        assert_eq!(result.total, 1);
        assert_eq!(result.rows[0].note.path, "q/b.md");
    }

    #[test]
    fn query_bases_sort_by_property_asc() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("q/b.md", "B"), "body").expect("b");
        upsert_note(&conn, &note("q/a.md", "A"), "body").expect("a");
        upsert_note(&conn, &note("q/c.md", "C"), "body").expect("c");
        insert_prop(&conn, "q/b.md", "rank", "2", "number");
        insert_prop(&conn, "q/a.md", "rank", "1", "number");
        insert_prop(&conn, "q/c.md", "rank", "3", "number");

        let result = query_bases(&conn, make_query(vec![], vec![sort("rank", false)], 100, 0))
            .expect("query");
        let paths: Vec<&str> = result.rows.iter().map(|r| r.note.path.as_str()).collect();
        assert_eq!(paths, vec!["q/a.md", "q/b.md", "q/c.md"]);
    }

    #[test]
    fn query_bases_sort_by_property_desc() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("q/a.md", "A"), "body").expect("a");
        upsert_note(&conn, &note("q/b.md", "B"), "body").expect("b");
        upsert_note(&conn, &note("q/c.md", "C"), "body").expect("c");
        insert_prop(&conn, "q/a.md", "rank", "1", "number");
        insert_prop(&conn, "q/b.md", "rank", "2", "number");
        insert_prop(&conn, "q/c.md", "rank", "3", "number");

        let result = query_bases(&conn, make_query(vec![], vec![sort("rank", true)], 100, 0))
            .expect("query");
        let paths: Vec<&str> = result.rows.iter().map(|r| r.note.path.as_str()).collect();
        assert_eq!(paths, vec!["q/c.md", "q/b.md", "q/a.md"]);
    }

    #[test]
    fn query_bases_sort_by_title_asc() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("q/z.md", "Zebra"), "body").expect("z");
        upsert_note(&conn, &note("q/a.md", "Apple"), "body").expect("a");

        let result = query_bases(
            &conn,
            make_query(vec![], vec![sort("title", false)], 100, 0),
        )
        .expect("query");
        assert_eq!(result.rows[0].note.title, "Apple");
        assert_eq!(result.rows[1].note.title, "Zebra");
    }

    #[test]
    fn query_bases_pagination_limit_and_offset() {
        let conn = open_mem_db();
        for i in 0..5u32 {
            upsert_note(
                &conn,
                &note(&format!("q/{i}.md"), &format!("Note {i}")),
                "body",
            )
            .expect("upsert");
        }

        let page1 = query_bases(&conn, make_query(vec![], vec![], 2, 0)).expect("page1");
        let page2 = query_bases(&conn, make_query(vec![], vec![], 2, 2)).expect("page2");
        let page3 = query_bases(&conn, make_query(vec![], vec![], 2, 4)).expect("page3");

        assert_eq!(page1.rows.len(), 2);
        assert_eq!(page2.rows.len(), 2);
        assert_eq!(page3.rows.len(), 1);
        assert_eq!(page1.total, 5);
        assert_eq!(page2.total, 5);
    }

    #[test]
    fn query_bases_multiple_filters_anded() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("q/a.md", "A"), "body").expect("a");
        upsert_note(&conn, &note("q/b.md", "B"), "body").expect("b");
        upsert_note(&conn, &note("q/c.md", "C"), "body").expect("c");
        insert_prop(&conn, "q/a.md", "status", "active", "string");
        insert_tag(&conn, "q/a.md", "x", 0, "frontmatter");
        insert_prop(&conn, "q/b.md", "status", "active", "string");
        insert_tag(&conn, "q/b.md", "y", 0, "frontmatter");
        insert_prop(&conn, "q/c.md", "status", "done", "string");
        insert_tag(&conn, "q/c.md", "x", 0, "frontmatter");

        let result = query_bases(
            &conn,
            make_query(
                vec![filter("status", "eq", "active"), filter("tag", "eq", "x")],
                vec![],
                100,
                0,
            ),
        )
        .expect("query");
        assert_eq!(result.total, 1);
        assert_eq!(result.rows[0].note.path, "q/a.md");
    }

    #[test]
    fn query_bases_empty_result_set() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("q/a.md", "A"), "body").expect("a");

        let result = query_bases(
            &conn,
            make_query(vec![filter("status", "eq", "nonexistent")], vec![], 100, 0),
        )
        .expect("query");
        assert_eq!(result.total, 0);
        assert!(result.rows.is_empty());
    }

    #[test]
    fn query_bases_returns_properties_and_tags_per_row() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("q/a.md", "A"), "body").expect("upsert");
        insert_prop(&conn, "q/a.md", "status", "active", "string");
        insert_tag(&conn, "q/a.md", "foo", 0, "frontmatter");
        insert_tag(&conn, "q/a.md", "bar", 0, "frontmatter");

        let result = query_bases(&conn, make_query(vec![], vec![], 100, 0)).expect("query");
        assert_eq!(result.rows.len(), 1);
        let row = &result.rows[0];
        assert!(row.properties.contains_key("status"));
        assert!(row.tags.contains(&"foo".to_string()));
        assert!(row.tags.contains(&"bar".to_string()));
    }

    #[test]
    fn upsert_note_has_no_properties_or_tags_by_default() {
        let conn = open_mem_db();
        let meta = note("q/plain.md", "Plain");
        upsert_note(&conn, &meta, "Just plain body text.").expect("upsert");

        assert_eq!(count_rows(&conn, "note_properties", "q/plain.md"), 0);
        assert_eq!(count_rows(&conn, "note_inline_tags", "q/plain.md"), 0);
    }

    #[test]
    fn get_note_properties_returns_all_for_path() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("props/a.md", "A"), "body").expect("upsert");
        insert_prop(&conn, "props/a.md", "status", "draft", "string");
        insert_prop(&conn, "props/a.md", "priority", "5", "number");

        let props = get_note_properties(&conn, "props/a.md").expect("props");
        assert_eq!(props.len(), 2);
        assert_eq!(props["status"].0, "draft");
        assert_eq!(props["status"].1, "string");
        assert_eq!(props["priority"].0, "5");
        assert_eq!(props["priority"].1, "number");
    }

    #[test]
    fn get_note_properties_empty_for_missing_path() {
        let conn = open_mem_db();
        let props = get_note_properties(&conn, "nonexistent.md").expect("props");
        assert!(props.is_empty());
    }

    #[test]
    fn get_note_tags_returns_sorted() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("tags/a.md", "A"), "body").expect("upsert");
        insert_tag(&conn, "tags/a.md", "zebra", 0, "frontmatter");
        insert_tag(&conn, "tags/a.md", "alpha", 0, "frontmatter");
        insert_tag(&conn, "tags/a.md", "mid", 0, "frontmatter");

        let tags = get_note_tags(&conn, "tags/a.md").expect("tags");
        assert_eq!(tags, vec!["alpha", "mid", "zebra"]);
    }

    #[test]
    fn get_note_tags_empty_for_missing_path() {
        let conn = open_mem_db();
        let tags = get_note_tags(&conn, "nonexistent.md").expect("tags");
        assert!(tags.is_empty());
    }

    #[test]
    fn remove_note_clears_side_tables() {
        let conn = open_mem_db();
        let meta = note("rm/a.md", "A");
        upsert_note(&conn, &meta, "body").expect("upsert");
        insert_tag(&conn, "rm/a.md", "x", 0, "frontmatter");
        insert_prop(&conn, "rm/a.md", "status", "draft", "string");

        remove_note(&conn, "rm/a.md").expect("remove");

        assert_eq!(count_rows(&conn, "note_inline_tags", "rm/a.md"), 0);
        assert_eq!(count_rows(&conn, "note_properties", "rm/a.md"), 0);
    }

    #[test]
    fn rebuild_property_registry_aggregates() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("reg/a.md", "A"), "body").expect("a");
        upsert_note(&conn, &note("reg/b.md", "B"), "body").expect("b");
        insert_prop(&conn, "reg/a.md", "status", "draft", "string");
        insert_prop(&conn, "reg/b.md", "status", "active", "string");
        insert_prop(&conn, "reg/b.md", "priority", "1", "number");

        rebuild_property_registry(&conn).expect("rebuild");

        let mut stmt = conn
            .prepare("SELECT key, inferred_type, note_count FROM property_registry ORDER BY key")
            .expect("prepare");
        let rows: Vec<(String, String, i64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .expect("query")
            .collect::<Result<_, _>>()
            .expect("collect");

        assert_eq!(rows.len(), 2);
        let status = rows.iter().find(|(k, _, _)| k == "status").expect("status");
        assert_eq!(status.1, "string");
        assert_eq!(status.2, 2);
        let priority = rows
            .iter()
            .find(|(k, _, _)| k == "priority")
            .expect("priority");
        assert_eq!(priority.2, 1);
    }

    #[test]
    fn tag_prefix_query_matches_exact_and_descendants() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("a.md", "A"), "body").expect("a");
        upsert_note(&conn, &note("b.md", "B"), "body").expect("b");
        upsert_note(&conn, &note("c.md", "C"), "body").expect("c");
        upsert_note(&conn, &note("d.md", "D"), "body").expect("d");
        insert_tag(&conn, "a.md", "status", 0, "frontmatter");
        insert_tag(&conn, "b.md", "status/active", 2, "inline");
        insert_tag(&conn, "c.md", "status/done", 2, "inline");
        insert_tag(&conn, "d.md", "other", 2, "inline");

        let tag = "status";
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT path FROM note_inline_tags WHERE (tag = ?1 OR tag LIKE ?2) ORDER BY path ASC",
            )
            .expect("prepare");
        let rows: Vec<String> = stmt
            .query_map(params![tag, format!("{tag}/%")], |r| r.get(0))
            .expect("query")
            .collect::<Result<_, _>>()
            .expect("collect");

        assert_eq!(rows, vec!["a.md", "b.md", "c.md"]);
        assert!(!rows.contains(&"d.md".to_string()));
    }
}

pub fn get_orphan_outlinks(conn: &Connection, path: &str) -> Result<Vec<OrphanLink>, String> {
    let sql = "SELECT o.target_path,
                      (SELECT COUNT(*)
                       FROM outlinks refs
                       WHERE refs.target_path = o.target_path) as ref_count
               FROM outlinks o
               LEFT JOIN notes n ON n.path = o.target_path
               WHERE o.source_path = ?1 AND n.path IS NULL
               ORDER BY o.target_path";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![path], |row| {
            Ok(OrphanLink {
                target_path: row.get(0)?,
                ref_count: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn rename_folder_paths(
    conn: &Connection,
    old_prefix: &str,
    new_prefix: &str,
) -> Result<usize, String> {
    let like_pattern = like_prefix_pattern(old_prefix);
    let old_len = old_prefix.len() as i64;

    let count: usize = conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE path LIKE ?1 ESCAPE '\\'",
            params![like_pattern],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if count == 0 {
        return Ok(0);
    }

    conn.execute_batch("PRAGMA defer_foreign_keys = ON; BEGIN IMMEDIATE")
        .map_err(|e| e.to_string())?;

    let result = conn.execute_batch(
        "CREATE TEMP TABLE IF NOT EXISTS _fts_rename(title TEXT, name TEXT, path TEXT, body TEXT)",
    )
    .and_then(|_| conn.execute("DELETE FROM _fts_rename", []))
    .and_then(|_| conn.execute(
        "INSERT INTO _fts_rename SELECT title, name, ?1 || substr(path, ?2 + 1), body
         FROM notes_fts WHERE path LIKE ?3 ESCAPE '\\'",
        params![new_prefix, old_len, like_pattern],
    ))
    .and_then(|_| conn.execute(
        "DELETE FROM notes_fts WHERE path LIKE ?1 ESCAPE '\\'",
        params![like_pattern],
    ))
    .and_then(|_| conn.execute(
        "INSERT INTO notes_fts(title, name, path, body) SELECT * FROM _fts_rename",
        [],
    ))
    .and_then(|_| conn.execute("DROP TABLE IF EXISTS _fts_rename", []))
    .and_then(|_| conn.execute(
        "UPDATE notes SET path = ?1 || substr(path, ?2 + 1) WHERE path LIKE ?3 ESCAPE '\\'",
        params![new_prefix, old_len, like_pattern],
    ))
    .and_then(|_| conn.execute(
        "UPDATE outlinks SET source_path = ?1 || substr(source_path, ?2 + 1)
         WHERE source_path LIKE ?3 ESCAPE '\\'",
        params![new_prefix, old_len, like_pattern],
    ))
    .and_then(|_| conn.execute(
        "UPDATE outlinks SET target_path = ?1 || substr(target_path, ?2 + 1)
         WHERE target_path LIKE ?3 ESCAPE '\\'",
        params![new_prefix, old_len, like_pattern],
    ))
    .and_then(|_| conn.execute(
        "UPDATE note_properties SET path = ?1 || substr(path, ?2 + 1)
         WHERE path LIKE ?3 ESCAPE '\\'",
        params![new_prefix, old_len, like_pattern],
    ))
    .and_then(|_| conn.execute(
        "UPDATE note_inline_tags SET path = ?1 || substr(path, ?2 + 1)
         WHERE path LIKE ?3 ESCAPE '\\'",
        params![new_prefix, old_len, like_pattern],
    ))
    .and_then(|_| conn.execute(
        "UPDATE note_sections SET path = ?1 || substr(path, ?2 + 1)
         WHERE path LIKE ?3 ESCAPE '\\'",
        params![new_prefix, old_len, like_pattern],
    ))
    .and_then(|_| conn.execute(
        "UPDATE note_code_blocks SET path = ?1 || substr(path, ?2 + 1)
         WHERE path LIKE ?3 ESCAPE '\\'",
        params![new_prefix, old_len, like_pattern],
    ))
    .and_then(|_| conn.execute(
        "UPDATE note_headings SET note_path = ?1 || substr(note_path, ?2 + 1)
         WHERE note_path LIKE ?3 ESCAPE '\\'",
        params![new_prefix, old_len, like_pattern],
    ))
    .and_then(|_| conn.execute(
        "UPDATE note_links SET source_path = ?1 || substr(source_path, ?2 + 1)
         WHERE source_path LIKE ?3 ESCAPE '\\'",
        params![new_prefix, old_len, like_pattern],
    ))
    .and_then(|_| conn.execute(
        "UPDATE note_links SET target_path = ?1 || substr(target_path, ?2 + 1)
         WHERE target_path LIKE ?3 ESCAPE '\\'",
        params![new_prefix, old_len, like_pattern],
    ))
    .map_err(|e| e.to_string());

    match result {
        Ok(_) => {
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            if let Err(e) = vector_db::rename_embeddings_by_prefix(conn, old_prefix, new_prefix) {
                log::debug!("vector_db::rename_embeddings_by_prefix skipped: {e}");
            }
            Ok(count)
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

pub fn rename_note_path(conn: &Connection, old_path: &str, new_path: &str) -> Result<(), String> {
    conn.execute_batch("PRAGMA defer_foreign_keys = ON; BEGIN IMMEDIATE")
        .map_err(|e| e.to_string())?;

    let result = conn
        .execute(
            "UPDATE notes_fts SET path = ?1 WHERE path = ?2",
            params![new_path, old_path],
        )
        .and_then(|_| {
            conn.execute(
                "UPDATE notes SET path = ?1 WHERE path = ?2",
                params![new_path, old_path],
            )
        })
        .and_then(|_| {
            conn.execute(
                "UPDATE outlinks SET source_path = ?1 WHERE source_path = ?2",
                params![new_path, old_path],
            )
        })
        .and_then(|_| {
            conn.execute(
                "UPDATE note_properties SET path = ?1 WHERE path = ?2",
                params![new_path, old_path],
            )
        })
        .and_then(|_| {
            conn.execute(
                "UPDATE note_inline_tags SET path = ?1 WHERE path = ?2",
                params![new_path, old_path],
            )
        })
        .and_then(|_| {
            conn.execute(
                "UPDATE note_sections SET path = ?1 WHERE path = ?2",
                params![new_path, old_path],
            )
        })
        .and_then(|_| {
            conn.execute(
                "UPDATE note_code_blocks SET path = ?1 WHERE path = ?2",
                params![new_path, old_path],
            )
        })
        .and_then(|_| {
            conn.execute(
                "UPDATE note_headings SET note_path = ?1 WHERE note_path = ?2",
                params![new_path, old_path],
            )
        })
        .and_then(|_| {
            conn.execute(
                "UPDATE note_links SET source_path = ?1 WHERE source_path = ?2",
                params![new_path, old_path],
            )
        })
        .map(|_| ())
        .map_err(|e| e.to_string());

    match result {
        Ok(_) => {
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            if let Err(e) = vector_db::rename_embedding_path(conn, old_path, new_path) {
                log::debug!("vector_db::rename_embedding_path skipped: {e}");
            }
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

pub fn rebuild_property_registry(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM property_registry", [])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO property_registry (key, inferred_type, note_count)
         SELECT key,
                (SELECT type FROM note_properties np2 WHERE np2.key = np.key
                 GROUP BY type ORDER BY COUNT(*) DESC LIMIT 1) AS inferred_type,
                COUNT(DISTINCT path) AS note_count
         FROM note_properties np
         GROUP BY key",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_linked_paths_batch(
    conn: &Connection,
    paths: &[String],
) -> Result<std::collections::HashMap<String, std::collections::HashSet<String>>, String> {
    let mut result: std::collections::HashMap<String, std::collections::HashSet<String>> = paths
        .iter()
        .map(|p| (p.clone(), std::collections::HashSet::new()))
        .collect();

    if paths.is_empty() {
        return Ok(result);
    }

    let placeholders: String = paths.iter().map(|_| "?").collect::<Vec<_>>().join(",");

    let outlinks_sql = format!(
        "SELECT source_path, target_path FROM outlinks WHERE source_path IN ({})",
        placeholders
    );
    let mut stmt = conn.prepare(&outlinks_sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(paths.iter()), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        if let Ok((source, target)) = row {
            if let Some(set) = result.get_mut(&source) {
                set.insert(target);
            }
        }
    }

    let backlinks_sql = format!(
        "SELECT target_path, source_path FROM outlinks WHERE target_path IN ({})",
        placeholders
    );
    let mut stmt = conn.prepare(&backlinks_sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(paths.iter()), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        if let Ok((target, source)) = row {
            if let Some(set) = result.get_mut(&target) {
                set.insert(source);
            }
        }
    }

    Ok(result)
}

pub fn get_backlinks(conn: &Connection, path: &str) -> Result<Vec<IndexNoteMeta>, String> {
    let sql = "SELECT n.path, n.title, n.mtime_ms, n.size_bytes, n.file_type
               FROM outlinks o
               JOIN notes n ON n.path = o.source_path
               WHERE o.target_path = ?1
               ORDER BY n.path";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![path], |row| note_meta_from_row_cols(row, Some(4)))
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn get_note_properties(
    conn: &Connection,
    path: &str,
) -> Result<BTreeMap<String, (String, String)>, String> {
    let mut stmt = conn
        .prepare("SELECT key, value, type FROM note_properties WHERE path = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![path], |row| {
            Ok((
                row.get::<_, String>(0)?,
                (row.get::<_, String>(1)?, row.get::<_, String>(2)?),
            ))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<BTreeMap<_, _>, _>>()
        .map_err(|e| e.to_string())
}

pub fn get_note_tags(conn: &Connection, path: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT DISTINCT tag FROM note_inline_tags WHERE path = ?1 ORDER BY tag")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![path], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn list_all_tags(
    conn: &Connection,
) -> Result<Vec<crate::features::search::model::TagInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT tag, COUNT(*) as cnt
             FROM note_inline_tags
             GROUP BY tag
             ORDER BY cnt DESC, tag ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(crate::features::search::model::TagInfo {
                tag: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn list_all_properties(
    conn: &Connection,
) -> Result<Vec<crate::features::search::model::PropertyInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT key, type, COUNT(*)
             FROM note_properties
             GROUP BY key, type
             ORDER BY key ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(crate::features::search::model::PropertyInfo {
                name: row.get(0)?,
                property_type: row.get(1)?,
                count: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn query_bases(
    conn: &Connection,
    query: crate::features::search::model::BaseQuery,
) -> Result<crate::features::search::model::BaseQueryResults, String> {
    let stat_columns = [
        "word_count",
        "char_count",
        "heading_count",
        "outlink_count",
        "reading_time_secs",
    ];
    let direct_columns = ["path", "title", "mtime_ms", "size_bytes"];
    let task_agg_columns = ["task_count", "tasks_done", "tasks_todo", "next_due_date"];

    let is_direct_col = |prop: &str| direct_columns.contains(&prop) || stat_columns.contains(&prop);
    let is_task_agg_col = |prop: &str| task_agg_columns.contains(&prop);

    let mut where_clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    for filter in &query.filters {
        if filter.property == "tag" || filter.property == "tags" {
            where_clauses.push(format!(
                "path IN (SELECT path FROM note_inline_tags WHERE tag = ?{})",
                params.len() + 1
            ));
            params.push(Box::new(filter.value.clone()));
        } else if is_task_agg_col(&filter.property) {
            let op = match filter.operator.as_str() {
                "eq" => "=",
                "neq" => "!=",
                "gt" => ">",
                "lt" => "<",
                "gte" => ">=",
                "lte" => "<=",
                _ => "=",
            };
            let col = format!("COALESCE(task_agg.{}, 0)", filter.property);
            where_clauses.push(format!("{} {} ?{}", col, op, params.len() + 1));
            params.push(Box::new(filter.value.clone()));
        } else if is_direct_col(&filter.property) {
            let op = match filter.operator.as_str() {
                "eq" => "=",
                "neq" => "!=",
                "contains" => "LIKE",
                "gt" => ">",
                "lt" => "<",
                "gte" => ">=",
                "lte" => "<=",
                _ => "=",
            };
            let val = if filter.operator == "contains" {
                format!("%{}%", filter.value)
            } else {
                filter.value.clone()
            };
            where_clauses.push(format!("notes.{} {} ?{}", filter.property, op, params.len() + 1));
            params.push(Box::new(val));
        } else {
            let op = match filter.operator.as_str() {
                "eq" => "=",
                "neq" => "!=",
                "contains" => "LIKE",
                "gt" => ">",
                "lt" => "<",
                "gte" => ">=",
                "lte" => "<=",
                _ => "=",
            };
            let val = if filter.operator == "contains" {
                format!("%{}%", filter.value)
            } else {
                filter.value.clone()
            };

            let numeric_ops = matches!(filter.operator.as_str(), "gt" | "lt" | "gte" | "lte");
            if numeric_ops {
                where_clauses.push(format!(
                    "path IN (SELECT path FROM note_properties WHERE key = ?{} AND CAST(value AS REAL) {} CAST(?{} AS REAL))",
                    params.len() + 1,
                    op,
                    params.len() + 2
                ));
            } else {
                where_clauses.push(format!(
                    "path IN (SELECT path FROM note_properties WHERE key = ?{} AND value {} ?{})",
                    params.len() + 1,
                    op,
                    params.len() + 2
                ));
            }
            params.push(Box::new(filter.property.clone()));
            params.push(Box::new(val));
        }
    }

    let where_sql = if where_clauses.is_empty() {
        "".to_string()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let order_sql = if let Some(sort) = query.sort.first() {
        if is_direct_col(&sort.property) {
            format!(
                "ORDER BY notes.{} {}",
                sort.property,
                if sort.descending { "DESC" } else { "ASC" }
            )
        } else if is_task_agg_col(&sort.property) {
            format!(
                "ORDER BY COALESCE(task_agg.{}, 0) {}",
                sort.property,
                if sort.descending { "DESC" } else { "ASC" }
            )
        } else {
            format!(
                "ORDER BY (SELECT value FROM note_properties WHERE path = notes.path AND key = ?{}) {}",
                params.len() + 1,
                if sort.descending { "DESC" } else { "ASC" }
            )
        }
    } else {
        "ORDER BY notes.path ASC".to_string()
    };

    let params_len = params.len();
    let mut final_params = params;
    if let Some(sort) = query.sort.first() {
        if !is_direct_col(&sort.property) {
            final_params.push(Box::new(sort.property.clone()));
        }
    }

    let sql = format!(
        "SELECT notes.path, title, mtime_ms, size_bytes, word_count, char_count, heading_count, outlink_count, reading_time_secs, last_indexed_at, file_type, \
         COALESCE(task_agg.task_count, 0), COALESCE(task_agg.tasks_done, 0), COALESCE(task_agg.tasks_todo, 0), task_agg.next_due_date \
         FROM notes \
         LEFT JOIN ( \
           SELECT path, COUNT(*) as task_count, \
             SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as tasks_done, \
             SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as tasks_todo, \
             MIN(CASE WHEN status != 'done' AND due_date IS NOT NULL THEN due_date END) as next_due_date \
           FROM tasks GROUP BY path \
         ) task_agg ON task_agg.path = notes.path \
         {} {} LIMIT {} OFFSET {}",
        where_sql, order_sql, query.limit, query.offset
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let param_refs: Vec<&dyn rusqlite::ToSql> = final_params.iter().map(|b| b.as_ref()).collect();

    let note_rows = stmt
        .query_map(&param_refs[..], |row| note_meta_with_stats_from_row(row))
        .map_err(|e| e.to_string())?;

    let mut notes_with_stats: Vec<(
        crate::features::search::model::IndexNoteMeta,
        crate::features::search::model::NoteStats,
    )> = Vec::new();
    for note_res in note_rows {
        notes_with_stats.push(note_res.map_err(|e| e.to_string())?);
    }

    let paths: Vec<&str> = notes_with_stats
        .iter()
        .map(|(n, _)| n.path.as_str())
        .collect();

    let mut props_by_path: HashMap<
        String,
        BTreeMap<String, crate::features::search::model::PropertyValue>,
    > = HashMap::new();
    let mut tags_by_path: HashMap<String, Vec<String>> = HashMap::new();

    if !paths.is_empty() {
        let placeholders: String = paths.iter().map(|_| "?").collect::<Vec<_>>().join(",");

        let prop_sql = format!(
            "SELECT path, key, value, type FROM note_properties WHERE path IN ({})",
            placeholders
        );
        let mut prop_stmt = conn.prepare(&prop_sql).map_err(|e| e.to_string())?;
        let prop_rows = prop_stmt
            .query_map(rusqlite::params_from_iter(paths.iter()), |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    crate::features::search::model::PropertyValue {
                        value: row.get(2)?,
                        property_type: row.get(3)?,
                    },
                ))
            })
            .map_err(|e| e.to_string())?;
        for prop_res in prop_rows {
            let (path, key, val) = prop_res.map_err(|e| e.to_string())?;
            props_by_path.entry(path).or_default().insert(key, val);
        }

        let tag_sql = format!(
            "SELECT path, tag FROM note_inline_tags WHERE path IN ({})",
            placeholders
        );
        let mut tag_stmt = conn.prepare(&tag_sql).map_err(|e| e.to_string())?;
        let tag_rows = tag_stmt
            .query_map(rusqlite::params_from_iter(paths.iter()), |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        for tag_res in tag_rows {
            let (path, tag) = tag_res.map_err(|e| e.to_string())?;
            let tags = tags_by_path.entry(path).or_default();
            if !tags.contains(&tag) {
                tags.push(tag);
            }
        }
    }

    let mut rows = Vec::new();
    for (note, stats) in notes_with_stats {
        let properties = props_by_path.remove(&note.path).unwrap_or_default();
        let tags = tags_by_path.remove(&note.path).unwrap_or_default();
        rows.push(crate::features::search::model::BaseNoteRow {
            note,
            properties,
            tags,
            stats,
        });
    }

    let count_sql = format!("SELECT COUNT(*) FROM notes {}", where_sql);
    let mut count_stmt = conn.prepare(&count_sql).map_err(|e| e.to_string())?;
    let count_param_refs = if final_params.len() > params_len {
        &param_refs[..params_len]
    } else {
        &param_refs[..]
    };

    let total: usize = count_stmt
        .query_row(count_param_refs, |row| row.get(0))
        .map_err(|e| e.to_string())?;

    Ok(crate::features::search::model::BaseQueryResults { rows, total })
}
