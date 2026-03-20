use crate::features::notes::service as notes_service;
use crate::features::search::model::{IndexNoteMeta, SearchHit, SearchScope};
use crate::features::search::vector_db;
use crate::features::tasks::service as tasks_service;
use crate::shared::constants;
use crate::shared::markdown_doc::ParsedNote;
use crate::shared::storage;
use crate::shared::vault_ignore;
use crate::shared::{link_parser, markdown_doc};
use fuzzy_matcher::skim::SkimMatcherV2;
use fuzzy_matcher::FuzzyMatcher;
use rusqlite::{params, Connection};
use serde::Serialize;
use specta::Type;
use std::collections::{BTreeMap, BTreeSet};
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

#[allow(dead_code)]
pub(crate) fn gfm_link_targets(markdown: &str, source_path: &str) -> Vec<String> {
    link_parser::gfm_link_targets(markdown, source_path)
}

#[allow(dead_code)]
pub(crate) fn wiki_link_targets(markdown: &str, source_path: &str) -> Vec<String> {
    link_parser::wiki_link_targets(markdown, source_path)
}

#[allow(dead_code)]
pub(crate) fn internal_link_targets(markdown: &str, source_path: &str) -> Vec<String> {
    link_parser::internal_link_targets(markdown, source_path)
}

pub type LocalLinksSnapshot = link_parser::LocalLinksSnapshot;

pub fn extract_local_links_snapshot(markdown: &str, source_path: &str) -> LocalLinksSnapshot {
    link_parser::extract_local_links_snapshot(markdown, source_path)
}

pub(crate) fn list_indexable_files(
    app: Option<&tauri::AppHandle>,
    vault_id: &str,
    root: &Path,
) -> Result<Vec<PathBuf>, String> {
    let ignore_matcher = if let Some(app) = app {
        vault_ignore::load_vault_ignore_matcher(app, vault_id, root)?
    } else {
        vault_ignore::VaultIgnoreMatcher::default()
    };
    let mut files: Vec<PathBuf> = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !constants::is_excluded_folder(&name)
                && !ignore_matcher.is_ignored(root, e.path(), e.file_type().is_dir())
        })
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.path().to_path_buf())
        .collect();
    files.sort();
    Ok(files)
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
    })
}

#[allow(dead_code)]
pub(crate) fn extract_meta(abs: &Path, vault_root: &Path) -> Result<IndexNoteMeta, String> {
    let mut meta = extract_file_meta(abs, vault_root)?;
    meta.title = notes_service::extract_title(abs);
    Ok(meta)
}

fn db_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .home_dir()
        .map_err(|e| e.to_string())?
        .join(".badgerly")
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
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-8000; PRAGMA mmap_size=268435456;")
        .map_err(|e| e.to_string())?;
    init_schema(&conn)?;
    Ok(conn)
}

fn is_iso_date(s: &str) -> bool {
    let b = s.as_bytes();
    match b.len() {
        10 => {
            b[4] == b'-'
                && b[7] == b'-'
                && b[..4].iter().all(|c| c.is_ascii_digit())
                && b[5..7].iter().all(|c| c.is_ascii_digit())
                && b[8..10].iter().all(|c| c.is_ascii_digit())
        }
        n if n >= 19 => {
            b[4] == b'-'
                && b[7] == b'-'
                && b[10] == b'T'
                && b[13] == b':'
                && b[16] == b':'
                && b[..4].iter().all(|c| c.is_ascii_digit())
                && b[5..7].iter().all(|c| c.is_ascii_digit())
                && b[8..10].iter().all(|c| c.is_ascii_digit())
                && b[11..13].iter().all(|c| c.is_ascii_digit())
                && b[14..16].iter().all(|c| c.is_ascii_digit())
                && b[17..19].iter().all(|c| c.is_ascii_digit())
        }
        _ => false,
    }
}

fn flatten_yaml_value(
    prefix: &str,
    value: &serde_yml::Value,
    out: &mut Vec<(String, String, &'static str)>,
) {
    match value {
        serde_yml::Value::Sequence(seq) => {
            for item in seq {
                let (val_str, val_type) = scalar_to_string(item);
                out.push((prefix.to_string(), val_str, val_type));
            }
        }
        serde_yml::Value::Mapping(map) => {
            for (k, v) in map {
                if let Some(key_str) = k.as_str() {
                    let nested_key = format!("{prefix}.{key_str}");
                    flatten_yaml_value(&nested_key, v, out);
                }
            }
        }
        serde_yml::Value::Null => {}
        scalar => {
            let (val_str, val_type) = scalar_to_string(scalar);
            out.push((prefix.to_string(), val_str, val_type));
        }
    }
}

fn scalar_to_string(value: &serde_yml::Value) -> (String, &'static str) {
    match value {
        serde_yml::Value::String(s) => {
            let t = if is_iso_date(s) { "date" } else { "string" };
            (s.clone(), t)
        }
        serde_yml::Value::Number(n) => (n.to_string(), "number"),
        serde_yml::Value::Bool(b) => (b.to_string(), "boolean"),
        _ => (serde_json::to_string(value).unwrap_or_default(), "json"),
    }
}

pub fn upsert_note_parsed(
    conn: &Connection,
    meta: &IndexNoteMeta,
    raw_markdown: &str,
    parsed: &ParsedNote,
) -> Result<(), String> {
    conn.execute_batch("BEGIN IMMEDIATE")
        .map_err(|e| e.to_string())?;
    let result = upsert_note_parsed_inner(conn, meta, raw_markdown, parsed);
    match result {
        Ok(()) => conn.execute_batch("COMMIT").map_err(|e| e.to_string()),
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

pub(crate) fn upsert_note_parsed_inner(
    conn: &Connection,
    meta: &IndexNoteMeta,
    raw_markdown: &str,
    parsed: &ParsedNote,
) -> Result<(), String> {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    conn.execute(
        "REPLACE INTO notes (path, title, mtime_ms, size_bytes, word_count, char_count, heading_count, reading_time_secs, last_indexed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![meta.path, meta.title, meta.mtime_ms, meta.size_bytes, parsed.word_count, parsed.char_count, parsed.heading_count, parsed.reading_time_secs, now_ms],
    )
    .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM notes_fts WHERE path = ?1", params![meta.path])
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO notes_fts (title, name, path, body) VALUES (?1, ?2, ?3, ?4)",
        params![meta.title, meta.name, meta.path, raw_markdown],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM note_properties WHERE path = ?1",
        params![meta.path],
    )
    .map_err(|e| e.to_string())?;

    let mut flat_props: Vec<(String, String, &'static str)> = Vec::new();
    for (key, value) in &parsed.frontmatter.properties {
        flatten_yaml_value(key, value, &mut flat_props);
    }
    for (key, val_str, val_type) in &flat_props {
        conn.execute(
            "INSERT INTO note_properties (path, key, value, type) VALUES (?1, ?2, ?3, ?4)",
            params![meta.path, key, val_str, val_type],
        )
        .map_err(|e| e.to_string())?;
    }

    conn.execute(
        "DELETE FROM note_inline_tags WHERE path = ?1",
        params![meta.path],
    )
    .map_err(|e| e.to_string())?;

    for tag in &parsed.frontmatter.tags {
        conn.execute(
            "REPLACE INTO note_inline_tags (path, tag, line, source) VALUES (?1, ?2, 0, 'frontmatter')",
            params![meta.path, tag],
        )
        .map_err(|e| e.to_string())?;
    }

    for it in &parsed.inline_tags {
        conn.execute(
            "REPLACE INTO note_inline_tags (path, tag, line, source) VALUES (?1, ?2, ?3, 'inline')",
            params![meta.path, it.tag, it.line],
        )
        .map_err(|e| e.to_string())?;
    }

    conn.execute(
        "DELETE FROM note_sections WHERE path = ?1",
        params![meta.path],
    )
    .map_err(|e| e.to_string())?;

    for sec in &parsed.sections {
        conn.execute(
            "REPLACE INTO note_sections (path, heading_id, level, title, start_line, end_line, word_count) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![meta.path, sec.heading_id, sec.level, sec.title, sec.start_line, sec.end_line, sec.word_count],
        )
        .map_err(|e| e.to_string())?;
    }

    conn.execute(
        "DELETE FROM note_code_blocks WHERE path = ?1",
        params![meta.path],
    )
    .map_err(|e| e.to_string())?;

    for cb in &parsed.code_blocks {
        conn.execute(
            "REPLACE INTO note_code_blocks (path, line, language, length) VALUES (?1, ?2, ?3, ?4)",
            params![meta.path, cb.line, cb.language, cb.length],
        )
        .map_err(|e| e.to_string())?;
    }

    tasks_service::save_tasks(conn, &meta.path, &parsed.tasks)?;

    conn.execute(
        "DELETE FROM note_headings WHERE note_path = ?1",
        params![meta.path],
    )
    .map_err(|e| e.to_string())?;

    for h in &parsed.headings {
        conn.execute(
            "INSERT INTO note_headings (note_path, level, text, line) VALUES (?1, ?2, ?3, ?4)",
            params![meta.path, h.level, h.text, h.line],
        )
        .map_err(|e| e.to_string())?;
    }

    conn.execute(
        "DELETE FROM note_links WHERE source_path = ?1",
        params![meta.path],
    )
    .map_err(|e| e.to_string())?;

    for target in &parsed.links.wiki_targets {
        conn.execute(
            "INSERT INTO note_links (source_path, target_path, link_text, link_type) VALUES (?1, ?2, NULL, 'wiki')",
            params![meta.path, target],
        )
        .map_err(|e| e.to_string())?;
    }

    for target in &parsed.links.markdown_targets {
        conn.execute(
            "INSERT INTO note_links (source_path, target_path, link_text, link_type) VALUES (?1, ?2, NULL, 'markdown')",
            params![meta.path, target],
        )
        .map_err(|e| e.to_string())?;
    }

    for link in &parsed.links.external_links {
        conn.execute(
            "INSERT INTO note_links (source_path, target_path, link_text, link_type) VALUES (?1, ?2, ?3, 'external')",
            params![meta.path, link.url, link.text],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn upsert_note(conn: &Connection, meta: &IndexNoteMeta, body: &str) -> Result<(), String> {
    let parsed = markdown_doc::parse_note(body, &meta.path);
    upsert_note_parsed(conn, meta, body, &parsed)
}

fn upsert_note_inner(conn: &Connection, meta: &IndexNoteMeta, body: &str) -> Result<(), String> {
    let parsed = markdown_doc::parse_note(body, &meta.path);
    upsert_note_parsed_inner(conn, meta, body, &parsed)
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
}

pub struct SyncPlan {
    pub added: Vec<PathBuf>,
    pub modified: Vec<PathBuf>,
    pub removed: Vec<String>,
    pub unchanged: usize,
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
            let raw = std::fs::read_to_string(abs).unwrap_or_default();
            let mut meta = match extract_file_meta(abs, vault_root) {
                Ok(m) => m,
                Err(e) => {
                    log::warn!("skip {}: {}", abs.display(), e);
                    continue;
                }
            };

            index_single_file(conn, abs, &raw, &mut meta, &mut pending_links)?;
        }

        resolve_batch_outlinks(conn, &pending_links)?;
        conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
        on_progress(indexed, total);
        yield_fn();
    }

    Ok(IndexResult { total, indexed })
}

fn index_single_file(
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
        let parsed = markdown_doc::parse_note(raw, &meta.path);
        meta.title = parsed.title.clone().unwrap_or_else(|| meta.name.clone());
        upsert_note_parsed_inner(conn, meta, raw, &parsed)?;
        let targets = parsed.links.all_internal_targets();
        pending_links.push((meta.path.clone(), targets));
    } else {
        upsert_note_inner(conn, meta, "")?;
        pending_links.push((meta.path.clone(), vec![]));
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
    let manifest = get_manifest(conn).unwrap_or_default();
    let disk_files = list_indexable_files(app, vault_id, vault_root)?;
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
            let raw = std::fs::read_to_string(abs).unwrap_or_default();
            let mut meta = match extract_file_meta(abs, vault_root) {
                Ok(m) => m,
                Err(e) => {
                    log::warn!("skip {}: {}", abs.display(), e);
                    continue;
                }
            };

            index_single_file(conn, abs, &raw, &mut meta, &mut pending_links)?;
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

pub fn get_all_notes_from_db(conn: &Connection) -> Result<BTreeMap<String, IndexNoteMeta>, String> {
    let mut stmt = conn
        .prepare("SELECT path, title, mtime_ms, size_bytes FROM notes")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| note_meta_from_row(row))
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
        .prepare("SELECT path, title, mtime_ms, size_bytes FROM notes")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| note_meta_from_row(row))
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

fn note_meta_from_row(row: &rusqlite::Row) -> rusqlite::Result<IndexNoteMeta> {
    let path: String = row.get(0)?;
    let title: String = row.get(1)?;
    let name = file_stem_string(Path::new(&path));
    Ok(IndexNoteMeta {
        id: path.clone(),
        path,
        title,
        name,
        mtime_ms: row.get(2)?,
        size_bytes: row.get(3)?,
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
    };
    let stats = crate::features::search::model::NoteStats {
        word_count: row.get(4).unwrap_or(0),
        char_count: row.get(5).unwrap_or(0),
        heading_count: row.get(6).unwrap_or(0),
        outlink_count: row.get(7).unwrap_or(0),
        reading_time_secs: row.get(8).unwrap_or(0),
        last_indexed_at: row.get(9).unwrap_or(0),
    };
    Ok((meta, stats))
}

pub fn search(
    conn: &Connection,
    query: &str,
    scope: SearchScope,
    limit: usize,
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

    let sql = "SELECT n.path, n.title, n.mtime_ms, n.size_bytes,
                      snippet(notes_fts, 3, '<b>', '</b>', '...', 30) as snippet,
                      bm25(notes_fts, 10.0, 12.0, 5.0, 1.0) as rank
               FROM notes_fts
               JOIN notes n ON n.path = notes_fts.path
               WHERE notes_fts MATCH ?1
               ORDER BY rank
               LIMIT ?2";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![match_expr, limit], |row| {
            Ok(SearchHit {
                note: note_meta_from_row(row)?,
                score: row.get(5)?,
                snippet: row.get(4)?,
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
                      bm25(notes_fts, 15.0, 20.0, 5.0, 0.0) as rank
               FROM notes_fts
               JOIN notes n ON n.path = notes_fts.path
               WHERE notes_fts MATCH ?1
               ORDER BY rank
               LIMIT ?2";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![match_expr, limit], |row| {
            Ok(SuggestionHit {
                note: note_meta_from_row(row)?,
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

    let sql = "SELECT path, title, mtime_ms, size_bytes FROM notes";
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;

    let matcher = SkimMatcherV2::default();
    let mut scored: Vec<SuggestionHit> = Vec::new();

    let rows = stmt
        .query_map([], |row| {
            let path: String = row.get(0)?;
            let title: String = row.get(1)?;
            let name = file_stem_string(Path::new(&path));
            let mtime_ms: i64 = row.get(2)?;
            let size_bytes: i64 = row.get(3)?;
            Ok((path, title, name, mtime_ms, size_bytes))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (path, title, name, mtime_ms, size_bytes) = row.map_err(|e| e.to_string())?;

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
    let sql = "SELECT path, title, mtime_ms, size_bytes
               FROM notes
               WHERE path = ?1";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    match stmt.query_row(params![path], note_meta_from_row) {
        Ok(note) => Ok(Some(note)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub fn get_outlinks(conn: &Connection, path: &str) -> Result<Vec<IndexNoteMeta>, String> {
    let sql = "SELECT n.path, n.title, n.mtime_ms, n.size_bytes
               FROM outlinks o
               JOIN notes n ON n.path = o.target_path
               WHERE o.source_path = ?1
               ORDER BY n.path";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![path], |row| note_meta_from_row(row))
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
        assert_eq!(stats.heading_count, 2);
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
    fn upsert_note_stores_properties_and_tags() {
        let conn = open_mem_db();
        let meta = note("notes/a.md", "Note A");
        let body = "---\nstatus: active\npriority: 3\ntags: [foo, bar]\n---\nbody";
        upsert_note(&conn, &meta, body).expect("upsert");

        let prop_count: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM note_properties WHERE path = ?1",
                params!["notes/a.md"],
                |r| r.get(0),
            )
            .expect("count");
        assert_eq!(prop_count, 2);

        let tag_count: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM note_inline_tags WHERE path = ?1",
                params!["notes/a.md"],
                |r| r.get(0),
            )
            .expect("count");
        assert_eq!(tag_count, 2);

        let val: String = conn
            .query_row(
                "SELECT value FROM note_properties WHERE path = ?1 AND key = 'status'",
                params!["notes/a.md"],
                |r| r.get(0),
            )
            .expect("value");
        assert_eq!(val, "active");
    }

    #[test]
    fn upsert_note_replaces_old_properties_and_tags() {
        let conn = open_mem_db();
        let meta = note("notes/b.md", "Note B");

        upsert_note(&conn, &meta, "---\nstatus: old\ntags: [old_tag]\n---\nbody").expect("first");
        upsert_note(&conn, &meta, "---\nstatus: new\ntags: [new_tag]\n---\nbody").expect("second");

        let prop_count: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM note_properties WHERE path = ?1",
                params!["notes/b.md"],
                |r| r.get(0),
            )
            .expect("prop count");
        assert_eq!(prop_count, 1);

        let val: String = conn
            .query_row(
                "SELECT value FROM note_properties WHERE path = ?1 AND key = 'status'",
                params!["notes/b.md"],
                |r| r.get(0),
            )
            .expect("value");
        assert_eq!(val, "new");

        let tag_count: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM note_inline_tags WHERE path = ?1",
                params!["notes/b.md"],
                |r| r.get(0),
            )
            .expect("tag count");
        assert_eq!(tag_count, 1);

        let tag: String = conn
            .query_row(
                "SELECT DISTINCT tag FROM note_inline_tags WHERE path = ?1",
                params!["notes/b.md"],
                |r| r.get(0),
            )
            .expect("tag");
        assert_eq!(tag, "new_tag");
    }

    #[test]
    fn remove_note_cleans_up_properties_and_tags() {
        let conn = open_mem_db();
        let meta = note("notes/c.md", "Note C");
        upsert_note(&conn, &meta, "---\nstatus: done\ntags: [x]\n---\nbody").expect("upsert");

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
        upsert_note(
            &conn,
            &meta,
            "---\nstatus: draft\ntags: [renamed]\n---\nbody",
        )
        .expect("upsert");

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
        upsert_note(&conn, &a, "---\nstatus: a\ntags: [ta]\n---\nbody").expect("upsert a");
        upsert_note(&conn, &b, "---\nstatus: b\ntags: [tb]\n---\nbody").expect("upsert b");

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
        let a = note("p/a.md", "A");
        let b = note("p/b.md", "B");
        upsert_note(&conn, &a, "---\nstatus: active\npriority: 1\n---\nbody").expect("upsert a");
        upsert_note(&conn, &b, "---\nstatus: done\n---\nbody").expect("upsert b");

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
    fn property_type_string() {
        let conn = open_mem_db();
        let meta = note("t/string.md", "T");
        upsert_note(&conn, &meta, "---\nfield: hello\n---\nbody").expect("upsert");

        let typ: String = conn
            .query_row(
                "SELECT type FROM note_properties WHERE path = ?1 AND key = 'field'",
                params!["t/string.md"],
                |r| r.get(0),
            )
            .expect("type");
        assert_eq!(typ, "string");
    }

    #[test]
    fn property_type_number() {
        let conn = open_mem_db();
        let meta = note("t/number.md", "T");
        upsert_note(&conn, &meta, "---\ncount: 42\n---\nbody").expect("upsert");

        let typ: String = conn
            .query_row(
                "SELECT type FROM note_properties WHERE path = ?1 AND key = 'count'",
                params!["t/number.md"],
                |r| r.get(0),
            )
            .expect("type");
        assert_eq!(typ, "number");
    }

    #[test]
    fn property_type_boolean() {
        let conn = open_mem_db();
        let meta = note("t/bool.md", "T");
        upsert_note(&conn, &meta, "---\npublished: true\n---\nbody").expect("upsert");

        let typ: String = conn
            .query_row(
                "SELECT type FROM note_properties WHERE path = ?1 AND key = 'published'",
                params!["t/bool.md"],
                |r| r.get(0),
            )
            .expect("type");
        assert_eq!(typ, "boolean");
    }

    #[test]
    fn property_type_nested_flattened() {
        let conn = open_mem_db();
        let meta = note("t/json.md", "T");
        upsert_note(&conn, &meta, "---\nmeta:\n  a: 1\n---\nbody").expect("upsert");

        let typ: String = conn
            .query_row(
                "SELECT type FROM note_properties WHERE path = ?1 AND key = 'meta.a'",
                params!["t/json.md"],
                |r| r.get(0),
            )
            .expect("type");
        assert_eq!(typ, "number");
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
        upsert_note(&conn, &note("q/a.md", "A"), "---\ntags: [rust]\n---\nbody").expect("a");
        upsert_note(
            &conn,
            &note("q/b.md", "B"),
            "---\ntags: [python]\n---\nbody",
        )
        .expect("b");

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
        upsert_note(&conn, &note("q/a.md", "A"), "---\nstatus: draft\n---\nbody").expect("a");
        upsert_note(&conn, &note("q/b.md", "B"), "---\nstatus: done\n---\nbody").expect("b");

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
        upsert_note(
            &conn,
            &note("q/a.md", "A"),
            "---\ntitle_prop: hello world\n---\nbody",
        )
        .expect("a");
        upsert_note(
            &conn,
            &note("q/b.md", "B"),
            "---\ntitle_prop: goodbye\n---\nbody",
        )
        .expect("b");

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
        upsert_note(&conn, &note("q/a.md", "A"), "---\nscore: 10\n---\nbody").expect("a");
        upsert_note(&conn, &note("q/b.md", "B"), "---\nscore: 5\n---\nbody").expect("b");

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
        upsert_note(&conn, &note("q/a.md", "A"), "---\nscore: 3\n---\nbody").expect("a");
        upsert_note(&conn, &note("q/b.md", "B"), "---\nscore: 7\n---\nbody").expect("b");
        upsert_note(&conn, &note("q/c.md", "C"), "---\nscore: 10\n---\nbody").expect("c");

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
        upsert_note(&conn, &note("q/a.md", "A"), "---\nstatus: draft\n---\nbody").expect("a");
        upsert_note(&conn, &note("q/b.md", "B"), "---\nstatus: done\n---\nbody").expect("b");

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
        upsert_note(&conn, &note("q/b.md", "B"), "---\nrank: 2\n---\nbody").expect("b");
        upsert_note(&conn, &note("q/a.md", "A"), "---\nrank: 1\n---\nbody").expect("a");
        upsert_note(&conn, &note("q/c.md", "C"), "---\nrank: 3\n---\nbody").expect("c");

        let result = query_bases(&conn, make_query(vec![], vec![sort("rank", false)], 100, 0))
            .expect("query");
        let paths: Vec<&str> = result.rows.iter().map(|r| r.note.path.as_str()).collect();
        assert_eq!(paths, vec!["q/a.md", "q/b.md", "q/c.md"]);
    }

    #[test]
    fn query_bases_sort_by_property_desc() {
        let conn = open_mem_db();
        upsert_note(&conn, &note("q/a.md", "A"), "---\nrank: 1\n---\nbody").expect("a");
        upsert_note(&conn, &note("q/b.md", "B"), "---\nrank: 2\n---\nbody").expect("b");
        upsert_note(&conn, &note("q/c.md", "C"), "---\nrank: 3\n---\nbody").expect("c");

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
        upsert_note(
            &conn,
            &note("q/a.md", "A"),
            "---\nstatus: active\npriority: 1\ntags: [x]\n---\nbody",
        )
        .expect("a");
        upsert_note(
            &conn,
            &note("q/b.md", "B"),
            "---\nstatus: active\npriority: 2\ntags: [y]\n---\nbody",
        )
        .expect("b");
        upsert_note(
            &conn,
            &note("q/c.md", "C"),
            "---\nstatus: done\npriority: 1\ntags: [x]\n---\nbody",
        )
        .expect("c");

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
        upsert_note(&conn, &note("q/a.md", "A"), "---\nstatus: draft\n---\nbody").expect("a");

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
        upsert_note(
            &conn,
            &note("q/a.md", "A"),
            "---\nstatus: active\ntags: [foo, bar]\n---\nbody",
        )
        .expect("upsert");

        let result = query_bases(&conn, make_query(vec![], vec![], 100, 0)).expect("query");
        assert_eq!(result.rows.len(), 1);
        let row = &result.rows[0];
        assert!(row.properties.contains_key("status"));
        assert!(row.tags.contains(&"foo".to_string()));
        assert!(row.tags.contains(&"bar".to_string()));
    }

    #[test]
    fn upsert_note_no_frontmatter_has_no_properties_or_tags() {
        let conn = open_mem_db();
        let meta = note("q/plain.md", "Plain");
        upsert_note(&conn, &meta, "Just plain body text.").expect("upsert");

        assert_eq!(count_rows(&conn, "note_properties", "q/plain.md"), 0);
        assert_eq!(count_rows(&conn, "note_inline_tags", "q/plain.md"), 0);
    }

    #[test]
    fn is_iso_date_recognizes_date() {
        assert!(is_iso_date("2024-01-15"));
        assert!(is_iso_date("2000-12-31"));
    }

    #[test]
    fn is_iso_date_recognizes_datetime() {
        assert!(is_iso_date("2024-01-15T10:30:00"));
        assert!(is_iso_date("2024-01-15T00:00:00Z"));
    }

    #[test]
    fn is_iso_date_rejects_non_dates() {
        assert!(!is_iso_date("2024"));
        assert!(!is_iso_date("01-15-2024"));
        assert!(!is_iso_date("January 15"));
        assert!(!is_iso_date("not-a-date"));
        assert!(!is_iso_date(""));
    }

    #[test]
    fn upsert_note_classifies_date_property() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        init_schema(&conn).expect("schema");

        let meta = note("dated.md", "Dated");
        let body = "---\ndue: 2024-01-15\ncreated: 2024-03-10T09:00:00\ntitle: plain\n---\nbody";
        upsert_note(&conn, &meta, body).expect("upsert");

        let mut stmt = conn
            .prepare("SELECT key, value, type FROM note_properties WHERE path = ?1 ORDER BY key")
            .expect("prepare");
        let rows: Vec<(String, String, String)> = stmt
            .query_map(params!["dated.md"], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .expect("query")
            .collect::<Result<_, _>>()
            .expect("collect");

        let created = rows
            .iter()
            .find(|(k, _, _)| k == "created")
            .expect("created");
        assert_eq!(created.2, "date");
        assert_eq!(created.1, "2024-03-10T09:00:00");

        let due = rows.iter().find(|(k, _, _)| k == "due").expect("due");
        assert_eq!(due.2, "date");
        assert_eq!(due.1, "2024-01-15");

        let title = rows.iter().find(|(k, _, _)| k == "title").expect("title");
        assert_eq!(title.2, "string");
    }

    #[test]
    fn get_note_properties_returns_all_for_path() {
        let conn = open_mem_db();
        let meta = note("props/a.md", "A");
        upsert_note(&conn, &meta, "---\nstatus: draft\npriority: 5\n---\nbody").expect("upsert");

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
        let meta = note("tags/a.md", "A");
        upsert_note(&conn, &meta, "---\ntags: [zebra, alpha, mid]\n---\nbody").expect("upsert");

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
    fn upsert_stores_inline_tags() {
        let conn = open_mem_db();
        let meta = note("tags/inline.md", "Inline");
        upsert_note(
            &conn,
            &meta,
            "---\ntags: [fm]\n---\nBody #inline-tag and #other",
        )
        .expect("upsert");

        let mut stmt = conn
            .prepare("SELECT tag, line, source FROM note_inline_tags WHERE path = ?1 ORDER BY tag")
            .expect("prepare");
        let rows: Vec<(String, i64, String)> = stmt
            .query_map(params!["tags/inline.md"], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .expect("query")
            .collect::<Result<_, _>>()
            .expect("collect");

        assert_eq!(rows.len(), 3);
        let fm_tag = rows.iter().find(|(t, _, _)| t == "fm").expect("fm tag");
        assert_eq!(fm_tag.2, "frontmatter");
        let inline = rows
            .iter()
            .find(|(t, _, _)| t == "inline-tag")
            .expect("inline tag");
        assert_eq!(inline.2, "inline");
    }

    #[test]
    fn upsert_stores_sections() {
        let conn = open_mem_db();
        let meta = note("sec/a.md", "A");
        upsert_note(
            &conn,
            &meta,
            "# Title\nIntro text\n## Section Two\nMore text",
        )
        .expect("upsert");

        let mut stmt = conn
            .prepare("SELECT heading_id, level, title, start_line, end_line FROM note_sections WHERE path = ?1 ORDER BY start_line")
            .expect("prepare");
        let rows: Vec<(String, i64, String, i64, i64)> = stmt
            .query_map(params!["sec/a.md"], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .expect("query")
            .collect::<Result<_, _>>()
            .expect("collect");

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].0, "title");
        assert_eq!(rows[0].1, 1);
        assert_eq!(rows[1].0, "section-two");
        assert_eq!(rows[1].1, 2);
    }

    #[test]
    fn upsert_stores_code_blocks() {
        let conn = open_mem_db();
        let meta = note("code/a.md", "A");
        upsert_note(
            &conn,
            &meta,
            "# Title\n\n```rust\nfn main() {}\n```\n\n```\nplain\n```",
        )
        .expect("upsert");

        let mut stmt = conn
            .prepare(
                "SELECT line, language, length FROM note_code_blocks WHERE path = ?1 ORDER BY line",
            )
            .expect("prepare");
        let rows: Vec<(i64, Option<String>, i64)> = stmt
            .query_map(params!["code/a.md"], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .expect("query")
            .collect::<Result<_, _>>()
            .expect("collect");

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].1, Some("rust".to_string()));
        assert_eq!(rows[1].1, None);
    }

    #[test]
    fn remove_note_clears_new_tables() {
        let conn = open_mem_db();
        let meta = note("rm/a.md", "A");
        upsert_note(
            &conn,
            &meta,
            "---\ntags: [x]\n---\n# H1\n\n```rust\ncode\n```\n\n#inline",
        )
        .expect("upsert");

        remove_note(&conn, "rm/a.md").expect("remove");

        let tag_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_inline_tags WHERE path = ?1",
                params!["rm/a.md"],
                |r| r.get(0),
            )
            .expect("count");
        let sec_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_sections WHERE path = ?1",
                params!["rm/a.md"],
                |r| r.get(0),
            )
            .expect("count");
        let cb_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_code_blocks WHERE path = ?1",
                params!["rm/a.md"],
                |r| r.get(0),
            )
            .expect("count");

        assert_eq!(tag_count, 0);
        assert_eq!(sec_count, 0);
        assert_eq!(cb_count, 0);
    }

    #[test]
    fn rename_note_path_updates_new_tables() {
        let conn = open_mem_db();
        let meta = note("old/a.md", "A");
        upsert_note(
            &conn,
            &meta,
            "---\ntags: [x]\n---\n# H1\n\n```rust\ncode\n```",
        )
        .expect("upsert");

        rename_note_path(&conn, "old/a.md", "new/a.md").expect("rename");

        let old_tags: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_inline_tags WHERE path = ?1",
                params!["old/a.md"],
                |r| r.get(0),
            )
            .expect("count");
        let new_tags: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_inline_tags WHERE path = ?1",
                params!["new/a.md"],
                |r| r.get(0),
            )
            .expect("count");
        assert_eq!(old_tags, 0);
        assert!(new_tags > 0);

        let new_secs: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_sections WHERE path = ?1",
                params!["new/a.md"],
                |r| r.get(0),
            )
            .expect("count");
        assert!(new_secs > 0);

        let new_cbs: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_code_blocks WHERE path = ?1",
                params!["new/a.md"],
                |r| r.get(0),
            )
            .expect("count");
        assert!(new_cbs > 0);
    }

    #[test]
    fn property_flattening_nested_yaml() {
        let conn = open_mem_db();
        let meta = note("flat/a.md", "A");
        upsert_note(
            &conn,
            &meta,
            "---\nproject:\n  name: Carbide\n  status: active\n---\nbody",
        )
        .expect("upsert");

        let props = get_note_properties(&conn, "flat/a.md").expect("props");
        assert_eq!(props["project.name"].0, "Carbide");
        assert_eq!(props["project.status"].0, "active");
    }

    #[test]
    fn property_flattening_arrays() {
        let conn = open_mem_db();
        let meta = note("flat/arr.md", "Arr");
        upsert_note(&conn, &meta, "---\naliases: [carbide, the-app]\n---\nbody").expect("upsert");

        let mut stmt = conn
            .prepare("SELECT value FROM note_properties WHERE path = ?1 AND key = 'aliases' ORDER BY value")
            .expect("prepare");
        let values: Vec<String> = stmt
            .query_map(params!["flat/arr.md"], |r| r.get(0))
            .expect("query")
            .collect::<Result<_, _>>()
            .expect("collect");

        assert_eq!(values, vec!["carbide", "the-app"]);
    }

    #[test]
    fn rebuild_property_registry_aggregates() {
        let conn = open_mem_db();
        upsert_note(
            &conn,
            &note("reg/a.md", "A"),
            "---\nstatus: draft\n---\nbody",
        )
        .expect("a");
        upsert_note(
            &conn,
            &note("reg/b.md", "B"),
            "---\nstatus: active\npriority: 1\n---\nbody",
        )
        .expect("b");

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

pub fn get_backlinks(conn: &Connection, path: &str) -> Result<Vec<IndexNoteMeta>, String> {
    let sql = "SELECT n.path, n.title, n.mtime_ms, n.size_bytes
               FROM outlinks o
               JOIN notes n ON n.path = o.source_path
               WHERE o.target_path = ?1
               ORDER BY n.path";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![path], |row| note_meta_from_row(row))
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

    let is_direct_col = |prop: &str| direct_columns.contains(&prop) || stat_columns.contains(&prop);

    let mut where_clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    for filter in &query.filters {
        if filter.property == "tag" || filter.property == "tags" {
            where_clauses.push(format!(
                "path IN (SELECT path FROM note_inline_tags WHERE tag = ?{})",
                params.len() + 1
            ));
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
            where_clauses.push(format!("{} {} ?{}", filter.property, op, params.len() + 1));
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

            where_clauses.push(format!(
                "path IN (SELECT path FROM note_properties WHERE key = ?{} AND value {} ?{})",
                params.len() + 1,
                op,
                params.len() + 2
            ));
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
                "ORDER BY {} {}",
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
        "ORDER BY path ASC".to_string()
    };

    let params_len = params.len();
    let mut final_params = params;
    if let Some(sort) = query.sort.first() {
        if !is_direct_col(&sort.property) {
            final_params.push(Box::new(sort.property.clone()));
        }
    }

    let sql = format!(
        "SELECT path, title, mtime_ms, size_bytes, word_count, char_count, heading_count, outlink_count, reading_time_secs, last_indexed_at FROM notes {} {} LIMIT {} OFFSET {}",
        where_sql, order_sql, query.limit, query.offset
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let param_refs: Vec<&dyn rusqlite::ToSql> = final_params.iter().map(|b| b.as_ref()).collect();

    let note_rows = stmt
        .query_map(&param_refs[..], |row| note_meta_with_stats_from_row(row))
        .map_err(|e| e.to_string())?;

    let mut rows = Vec::new();
    for note_res in note_rows {
        let (note, stats) = note_res.map_err(|e| e.to_string())?;

        let mut prop_stmt = conn
            .prepare("SELECT key, value, type FROM note_properties WHERE path = ?1")
            .map_err(|e| e.to_string())?;
        let prop_rows = prop_stmt
            .query_map(params![note.path], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    crate::features::search::model::PropertyValue {
                        value: row.get(1)?,
                        property_type: row.get(2)?,
                    },
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut properties = BTreeMap::new();
        for prop_res in prop_rows {
            let (key, val) = prop_res.map_err(|e| e.to_string())?;
            properties.insert(key, val);
        }

        let mut tag_stmt = conn
            .prepare("SELECT DISTINCT tag FROM note_inline_tags WHERE path = ?1")
            .map_err(|e| e.to_string())?;
        let tag_rows = tag_stmt
            .query_map(params![note.path], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;

        let mut tags = Vec::new();
        for tag_res in tag_rows {
            tags.push(tag_res.map_err(|e| e.to_string())?);
        }

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
