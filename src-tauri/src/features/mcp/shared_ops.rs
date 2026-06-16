//! Shared mutation/read operations for MCP and CLI surfaces.
//!
//! ## Index consistency policy: writes-complete-first, reads-fall-back
//!
//! Any mutation that affects link targets (rename, move, ...) follows this
//! contract:
//!
//! 1. Apply the filesystem mutation first — the source of truth is the disk,
//!    not the index.
//! 2. Before consulting the index for backlink sources, `index_upsert` the
//!    *new* path so a stale index entry does not silently mask a real source.
//!    See [`repair_links_for`].
//! 3. The link-rewrite pass reads every backlink source file fresh and writes
//!    it back atomically — index drift between the upsert and the rewrite is
//!    tolerated because the disk-side data is what we operate on.
//!
//! This policy is the canonical mitigation for the index-staleness failure
//! mode that drives 1.6 (link resolution misses), 2.4 (backlink repair gaps),
//! and 6.1 (suspected blocking reindex on `create_note`). New shared ops that
//! depend on the index for write decisions should follow the same pattern
//! rather than blocking on a full reindex.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use walkdir::WalkDir;

use crate::features::notes::service::{
    self as notes_service, safe_vault_abs, safe_vault_abs_for_write, MoveItem, MoveItemsArgs,
    NoteCreateArgs, NoteDeleteArgs, NoteMeta, NoteRenameArgs,
};
use crate::features::search::db as search_db;
use crate::features::search::model::SearchScope;
use crate::features::search::service as search_service;
use crate::features::search::service::SearchQueryInput;
use crate::features::vault::service as vault_service;
use crate::shared::{io_utils, storage};

pub enum OpError {
    NotFound(String),
    BadRequest(String),
    Conflict(String),
    Internal(String),
}

fn resolve_read_path(
    app: &AppHandle,
    vault_id: &str,
    path: &str,
) -> Result<(PathBuf, PathBuf), OpError> {
    let root = storage::vault_path(app, vault_id).map_err(OpError::Internal)?;
    let abs = safe_vault_abs(&root, path).map_err(OpError::BadRequest)?;
    Ok((root, abs))
}

fn resolve_write_path(
    app: &AppHandle,
    vault_id: &str,
    path: &str,
) -> Result<(PathBuf, PathBuf), OpError> {
    let root = storage::vault_path(app, vault_id).map_err(OpError::Internal)?;
    let abs = safe_vault_abs_for_write(&root, path).map_err(OpError::BadRequest)?;
    Ok((root, abs))
}

// --- Shared arg structs ---

#[derive(Deserialize)]
pub struct VaultPathArgs {
    pub vault_id: String,
    pub path: String,
}

#[derive(Deserialize)]
pub struct VaultIdArgs {
    pub vault_id: String,
}

#[derive(Deserialize)]
pub struct ListNotesArgs {
    pub vault_id: String,
    #[serde(default)]
    pub folder: Option<String>,
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub offset: Option<usize>,
}

#[derive(Serialize)]
pub struct PaginatedResponse<T: Serialize> {
    pub items: Vec<T>,
    pub total: usize,
    pub limit: usize,
    pub offset: usize,
}

#[derive(Deserialize)]
pub struct SearchArgs {
    pub vault_id: String,
    pub query: String,
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub mode: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateNoteArgs {
    pub vault_id: String,
    pub path: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub overwrite: bool,
}

#[derive(Deserialize)]
pub struct WriteNoteArgs {
    pub vault_id: String,
    pub path: String,
    pub content: String,
}

#[derive(Deserialize)]
pub struct RenameArgs {
    pub vault_id: String,
    pub path: String,
    pub new_path: String,
}

#[derive(Deserialize)]
pub struct MoveArgs {
    pub vault_id: String,
    pub path: String,
    pub to: String,
}

#[derive(Deserialize)]
pub struct NotesForTagArgs {
    pub vault_id: String,
    pub tag: String,
}

// --- Service wrappers ---

pub fn read_note(app: &AppHandle, vault_id: &str, path: &str) -> Result<(String, String), OpError> {
    let (_, abs) = resolve_read_path(app, vault_id, path)?;
    let content = std::fs::read_to_string(&abs)
        .map_err(|e| OpError::NotFound(format!("Failed to read note: {}", e)))?;
    Ok((path.to_string(), content))
}

pub fn write_note(
    app: &AppHandle,
    vault_id: &str,
    path: &str,
    content: &str,
) -> Result<String, OpError> {
    let (_, abs) = resolve_write_path(app, vault_id, path)?;
    if !abs.exists() {
        return Err(OpError::NotFound("note not found".into()));
    }
    io_utils::atomic_write(&abs, content.as_bytes()).map_err(OpError::Internal)?;
    Ok(path.to_string())
}

pub fn append_to_note(
    app: &AppHandle,
    vault_id: &str,
    path: &str,
    content: &str,
) -> Result<String, OpError> {
    let (_, abs) = resolve_read_path(app, vault_id, path)?;
    let existing = std::fs::read_to_string(&abs)
        .map_err(|e| OpError::NotFound(format!("Failed to read note: {}", e)))?;

    let mut new_content = existing;
    if !new_content.ends_with('\n') && !new_content.is_empty() {
        new_content.push('\n');
    }
    new_content.push_str(content);

    io_utils::atomic_write(&abs, new_content.as_bytes()).map_err(OpError::Internal)?;
    Ok(path.to_string())
}

pub fn prepend_to_note(
    app: &AppHandle,
    vault_id: &str,
    path: &str,
    content: &str,
) -> Result<String, OpError> {
    let (_, abs) = resolve_read_path(app, vault_id, path)?;
    let existing = std::fs::read_to_string(&abs)
        .map_err(|e| OpError::NotFound(format!("Failed to read note: {}", e)))?;

    let new_content = match find_frontmatter_end(&existing) {
        Some(pos) => {
            let mut result = String::with_capacity(existing.len() + content.len() + 1);
            result.push_str(&existing[..pos]);
            result.push_str(content);
            if !content.ends_with('\n') {
                result.push('\n');
            }
            result.push_str(&existing[pos..]);
            result
        }
        None => {
            let mut result = String::with_capacity(existing.len() + content.len() + 1);
            result.push_str(content);
            if !content.ends_with('\n') {
                result.push('\n');
            }
            result.push_str(&existing);
            result
        }
    };

    io_utils::atomic_write(&abs, new_content.as_bytes()).map_err(OpError::Internal)?;
    Ok(path.to_string())
}

pub enum CreateResult {
    Created(NoteMeta),
    Overwritten(String),
}

pub fn create_note(app: &AppHandle, args: &CreateNoteArgs) -> Result<CreateResult, OpError> {
    let (_, abs) = resolve_write_path(app, &args.vault_id, &args.path)?;

    if abs.exists() && !args.overwrite {
        return Err(OpError::Conflict("note already exists".into()));
    }

    if args.overwrite && abs.exists() {
        io_utils::atomic_write(&abs, args.content.as_bytes()).map_err(OpError::Internal)?;
        return Ok(CreateResult::Overwritten(args.path.clone()));
    }

    notes_service::create_note(
        NoteCreateArgs {
            vault_id: args.vault_id.clone(),
            note_path: args.path.clone(),
            initial_markdown: args.content.clone(),
        },
        app.clone(),
    )
    .map(CreateResult::Created)
    .map_err(OpError::Internal)
}

pub fn move_note(
    app: &AppHandle,
    vault_id: &str,
    path: &str,
    to: &str,
) -> Result<(String, usize), OpError> {
    let root = storage::vault_path(app, vault_id).map_err(OpError::Internal)?;
    let source_abs = safe_vault_abs(&root, path).map_err(OpError::BadRequest)?;
    let is_folder = source_abs
        .metadata()
        .map_err(|e| OpError::NotFound(format!("source not found: {}", e)))?
        .is_dir();

    let results = notes_service::move_items(
        MoveItemsArgs {
            vault_id: vault_id.to_string(),
            items: vec![MoveItem {
                path: path.to_string(),
                is_folder,
            }],
            target_folder: to.to_string(),
            overwrite: false,
        },
        app.clone(),
    )
    .map_err(OpError::Internal)?;

    let result = results
        .into_iter()
        .next()
        .ok_or_else(|| OpError::Internal("no move result".into()))?;

    if !result.success {
        return Err(OpError::Internal(
            result.error.unwrap_or_else(|| "move failed".into()),
        ));
    }

    let path_map = if is_folder {
        build_folder_move_path_map(&root, &result.path, &result.new_path)
    } else {
        let mut m = HashMap::new();
        m.insert(result.path.clone(), result.new_path.clone());
        m
    };

    let updated = repair_links_for(app, vault_id, &path_map).unwrap_or(0);
    Ok((result.new_path, updated))
}

/// After a folder move from `old_root` → `new_root`, walk the new location
/// and build the `old_subpath → new_subpath` map for every `.md` descendant.
/// Backlinks point at specific note paths, so every child needs its own entry.
fn build_folder_move_path_map(
    vault_root: &Path,
    old_root: &str,
    new_root: &str,
) -> HashMap<String, String> {
    let mut path_map = HashMap::new();
    let new_abs = vault_root.join(new_root);
    if !new_abs.is_dir() {
        return path_map;
    }

    for entry in WalkDir::new(&new_abs).into_iter().filter_map(Result::ok) {
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = match entry.path().strip_prefix(vault_root) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        if !rel_str.ends_with(".md") {
            continue;
        }
        let suffix = match rel_str.strip_prefix(&format!("{}/", new_root)) {
            Some(s) => s,
            None => continue,
        };
        let old_child = format!("{}/{}", old_root, suffix);
        path_map.insert(old_child, rel_str);
    }

    path_map
}

pub fn delete_note(app: &AppHandle, vault_id: &str, path: &str) -> Result<(), OpError> {
    notes_service::delete_note(
        NoteDeleteArgs {
            vault_id: vault_id.to_string(),
            note_id: path.to_string(),
        },
        app.clone(),
    )
    .map_err(OpError::Internal)
}

pub fn list_notes(
    app: &AppHandle,
    vault_id: &str,
    folder: Option<&str>,
    limit: usize,
    offset: usize,
) -> Result<PaginatedResponse<NoteMeta>, OpError> {
    let mut notes =
        notes_service::list_notes(app.clone(), vault_id.to_string()).map_err(OpError::Internal)?;

    if let Some(folder) = folder {
        let prefix = if folder.ends_with('/') {
            folder.to_string()
        } else {
            format!("{}/", folder)
        };
        notes.retain(|n| n.path.starts_with(&prefix));
    }

    let total = notes.len();
    let items: Vec<NoteMeta> = notes.into_iter().skip(offset).take(limit).collect();

    Ok(PaginatedResponse {
        items,
        total,
        limit,
        offset,
    })
}

pub fn search_notes_db(
    app: &AppHandle,
    vault_id: &str,
    query: &str,
    limit: usize,
) -> Result<Vec<crate::features::search::model::SearchHit>, OpError> {
    search_service::with_read_conn(app, vault_id, |conn| {
        search_db::search(conn, query, SearchScope::All, limit, None)
    })
    .map_err(OpError::Internal)
}

pub fn search_notes_index(
    app: &AppHandle,
    vault_id: &str,
    query: &str,
    limit: usize,
) -> Result<Vec<crate::features::search::model::SearchHit>, OpError> {
    let query_input = SearchQueryInput {
        raw: query.to_string(),
        text: query.to_string(),
        scope: SearchScope::All,
    };

    search_service::index_search(app.clone(), vault_id.to_string(), query_input)
        .map(|hits| hits.into_iter().take(limit).collect())
        .map_err(OpError::Internal)
}

pub fn search_notes_hybrid(
    app: &AppHandle,
    vault_id: &str,
    query: &str,
    limit: usize,
) -> Result<Vec<crate::features::search::model::HybridSearchHit>, OpError> {
    match search_service::hybrid_search_sync(app, vault_id, query, limit) {
        Ok(hits) => Ok(hits),
        Err(_) => {
            search_notes_index(app, vault_id, query, limit).map(|hits| {
                hits.into_iter()
                    .map(|h| crate::features::search::model::HybridSearchHit {
                        note: h.note,
                        score: h.score,
                        snippet: h.snippet,
                        snippet_page: None,
                        source: crate::features::search::model::HitSource::Fts,
                    })
                    .collect()
            })
        }
    }
}

pub fn list_vaults(app: &AppHandle) -> Result<Vec<crate::shared::storage::Vault>, OpError> {
    vault_service::list_vaults(app.clone()).map_err(OpError::Internal)
}

pub fn get_vault(
    app: &AppHandle,
    vault_id: &str,
) -> Result<crate::shared::storage::Vault, OpError> {
    let vaults = vault_service::list_vaults(app.clone()).map_err(OpError::Internal)?;
    vaults
        .into_iter()
        .find(|v| v.id == vault_id)
        .ok_or_else(|| OpError::NotFound("Vault not found".into()))
}

pub fn get_active_vault_id(app: &AppHandle) -> Result<Option<String>, OpError> {
    vault_service::get_last_vault_id(app.clone()).map_err(OpError::Internal)
}

pub fn reindex(app: &AppHandle, vault_id: &str) -> Result<(), OpError> {
    search_service::index_rebuild(app.clone(), vault_id.to_string()).map_err(OpError::Internal)
}

pub fn note_tags(
    app: &AppHandle,
    vault_id: &str,
) -> Result<Vec<crate::features::search::model::TagInfo>, OpError> {
    search_service::with_read_conn(app, vault_id, |conn| search_db::list_all_tags(conn))
        .map_err(OpError::Internal)
}

pub fn notes_for_tag(app: &AppHandle, vault_id: &str, tag: &str) -> Result<Vec<String>, OpError> {
    search_service::with_read_conn(app, vault_id, |conn| {
        search_db::get_notes_for_tag(conn, tag)
    })
    .map_err(OpError::Internal)
}

pub fn note_properties(
    app: &AppHandle,
    vault_id: &str,
) -> Result<Vec<crate::features::search::model::PropertyInfo>, OpError> {
    search_service::with_read_conn(app, vault_id, |conn| search_db::list_all_properties(conn))
        .map_err(OpError::Internal)
}

pub fn note_outline(
    app: &AppHandle,
    vault_id: &str,
    path: &str,
) -> Result<Vec<crate::features::search::model::NoteHeading>, OpError> {
    search_service::with_read_conn(app, vault_id, |conn| {
        search_db::get_note_headings(conn, path)
    })
    .map_err(OpError::Internal)
}

pub fn note_metadata(
    app: &AppHandle,
    vault_id: &str,
    path: &str,
) -> Result<NoteMetadataResult, OpError> {
    let root = storage::vault_path(app, vault_id).map_err(OpError::Internal)?;
    let meta = notes_service::build_note_meta(&root, path, None).map_err(OpError::Internal)?;

    let stats =
        search_service::get_note_stats(app.clone(), vault_id.to_string(), path.to_string()).ok();

    let tags_and_props = search_service::with_read_conn(app, vault_id, |conn| {
        let tags = search_db::get_note_tags(conn, path)?;
        let props = search_db::get_note_properties(conn, path)?;
        Ok((tags, props))
    })
    .ok();

    Ok(NoteMetadataResult {
        meta,
        stats,
        tags_and_props,
    })
}

pub struct NoteMetadataResult {
    pub meta: NoteMeta,
    pub stats: Option<crate::features::search::model::NoteStats>,
    pub tags_and_props: Option<(
        Vec<String>,
        std::collections::BTreeMap<String, (String, String)>,
    )>,
}

fn format_epoch_ms_as_date(ms: i64) -> String {
    let secs = ms / 1000;
    let days = secs / 86400;
    let mut y = 1970i32;
    let mut remaining = days;

    loop {
        let days_in_year = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 366 } else { 365 };
        if remaining < days_in_year {
            break;
        }
        remaining -= days_in_year;
        y += 1;
    }

    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let month_days = [
        31,
        if leap { 29 } else { 28 },
        31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ];
    let mut m = 0usize;
    for &md in &month_days {
        if remaining < md {
            break;
        }
        remaining -= md;
        m += 1;
    }

    format!("{:04}-{:02}-{:02}", y, m + 1, remaining + 1)
}

fn find_frontmatter_end(content: &str) -> Option<usize> {
    if !content.starts_with("---") {
        return None;
    }
    let after_open = &content[3..];
    let newline_pos = after_open.find('\n')?;
    let search_start = 3 + newline_pos + 1;
    let rest = &content[search_start..];
    for (i, line) in rest.lines().enumerate() {
        if line.trim() == "---" {
            let offset = if i == 0 {
                0
            } else {
                rest.match_indices('\n')
                    .nth(i - 1)
                    .map(|(pos, _)| pos + 1)
                    .unwrap_or(0)
            };
            return Some(search_start + offset + line.len() + 1);
        }
    }
    None
}

pub fn ensure_frontmatter(
    app: &AppHandle,
    vault_id: &str,
    path: &str,
) -> Result<String, OpError> {
    let (_, abs) = resolve_read_path(app, vault_id, path)?;
    let existing = std::fs::read_to_string(&abs)
        .map_err(|e| OpError::NotFound(format!("Failed to read note: {}", e)))?;

    if find_frontmatter_end(&existing).is_some() {
        return Ok(path.to_string());
    }

    let title = std::path::Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled");

    let mtime_ms = notes_service::file_meta(&abs)
        .map(|(m, _, _)| m)
        .unwrap_or(0);
    let date = format_epoch_ms_as_date(mtime_ms);

    let frontmatter = format!("---\ntitle: \"{}\"\ndate_created: {}\n---\n\n", title, date);
    let new_content = format!("{}{}", frontmatter, existing);

    io_utils::atomic_write(&abs, new_content.as_bytes()).map_err(OpError::Internal)?;
    Ok(path.to_string())
}

pub fn rename_note_and_update_links(
    app: &AppHandle,
    vault_id: &str,
    old_path: &str,
    new_path: &str,
) -> Result<(String, usize), OpError> {
    notes_service::rename_note(
        NoteRenameArgs {
            vault_id: vault_id.to_string(),
            from: old_path.to_string(),
            to: new_path.to_string(),
        },
        app.clone(),
    )
    .map_err(OpError::Internal)?;

    let mut path_map = HashMap::new();
    path_map.insert(old_path.to_string(), new_path.to_string());
    let updated_count = repair_links_for(app, vault_id, &path_map).unwrap_or(0);

    Ok((format!("{} → {}", old_path, new_path), updated_count))
}

/// Rewrite backlinks for every `(old_path → new_path)` entry in `path_map`.
///
/// Best-effort: a stale index, a missing file, or a failed write counts as a
/// skip and is reflected in the returned count, not as an error. The caller
/// has already committed the filesystem mutation by the time we get here
/// (writes-complete-first), so partial rewrites are recoverable by rerunning.
///
/// To avoid silently missing sources when the index lags the write, we
/// `index_upsert_note` each *new* path before querying backlinks. This makes
/// the new note discoverable by downstream readers even if the indexer
/// thread hasn't observed the rename yet. See the module docs.
pub fn repair_links_for(
    app: &AppHandle,
    vault_id: &str,
    path_map: &HashMap<String, String>,
) -> Result<usize, OpError> {
    if path_map.is_empty() {
        return Ok(0);
    }

    let vault_root = storage::vault_path(app, vault_id).map_err(OpError::Internal)?;

    for new_path in path_map.values() {
        let _ = search_service::index_upsert_note(
            app.clone(),
            vault_id.to_string(),
            new_path.clone(),
        );
    }

    let mut updated_count = 0usize;
    let mut visited: std::collections::HashSet<String> = std::collections::HashSet::new();

    for old_path in path_map.keys() {
        let backlink_notes = match search_service::with_read_conn(app, vault_id, |conn| {
            search_db::get_backlinks(conn, old_path)
        }) {
            Ok(notes) => notes,
            Err(_) => continue,
        };

        for note in backlink_notes {
            if path_map.contains_key(&note.path) {
                continue;
            }
            if !visited.insert(note.path.clone()) {
                continue;
            }

            let abs_path = PathBuf::from(&vault_root).join(&note.path);
            let content = match std::fs::read_to_string(&abs_path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let result = search_service::rewrite_note_links(
                content,
                note.path.clone(),
                note.path.clone(),
                path_map.clone(),
            );

            if result.changed
                && io_utils::atomic_write(&abs_path, result.markdown.as_bytes()).is_ok()
            {
                updated_count += 1;
            }
        }
    }

    for (old_path, new_path) in path_map {
        let abs_path = PathBuf::from(&vault_root).join(new_path);
        let content = match std::fs::read_to_string(&abs_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let result = search_service::rewrite_note_links(
            content,
            old_path.clone(),
            new_path.clone(),
            path_map.clone(),
        );

        if result.changed && io_utils::atomic_write(&abs_path, result.markdown.as_bytes()).is_ok() {
            updated_count += 1;
        }
    }

    Ok(updated_count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_frontmatter_end_with_frontmatter() {
        let content = "---\ntitle: Hello\n---\n# Body";
        let pos = find_frontmatter_end(content).unwrap();
        assert_eq!(&content[pos..], "# Body");
    }

    #[test]
    fn test_find_frontmatter_end_no_frontmatter() {
        let content = "# Just a heading\nSome text";
        assert_eq!(find_frontmatter_end(content), None);
    }

    #[test]
    fn test_find_frontmatter_end_empty_frontmatter() {
        let content = "---\n---\nBody text";
        let pos = find_frontmatter_end(content).unwrap();
        assert_eq!(&content[pos..], "Body text");
    }

    #[test]
    fn test_find_frontmatter_end_multiline() {
        let content = "---\ntitle: Test\ndate: 2026-01-01\ntags: [a, b]\n---\nContent here";
        let pos = find_frontmatter_end(content).unwrap();
        assert_eq!(&content[pos..], "Content here");
    }

    #[test]
    fn test_format_epoch_ms_as_date() {
        assert_eq!(format_epoch_ms_as_date(0), "1970-01-01");
        assert_eq!(format_epoch_ms_as_date(1_748_131_200_000), "2025-05-25");
        assert_eq!(format_epoch_ms_as_date(1_779_667_200_000), "2026-05-25");
    }

    #[test]
    fn build_folder_map_collects_every_md_child() {
        let temp = tempfile::tempdir().expect("tempdir");
        let root = temp.path();
        let new_root = root.join("new_folder");
        std::fs::create_dir_all(new_root.join("sub")).expect("mkdir sub");
        std::fs::write(new_root.join("a.md"), "a").expect("a.md");
        std::fs::write(new_root.join("b.md"), "b").expect("b.md");
        std::fs::write(new_root.join("sub/c.md"), "c").expect("sub/c.md");
        std::fs::write(new_root.join("readme.txt"), "readme").expect("readme.txt");

        let map = build_folder_move_path_map(root, "old_folder", "new_folder");

        assert_eq!(
            map.get("old_folder/a.md").map(String::as_str),
            Some("new_folder/a.md")
        );
        assert_eq!(
            map.get("old_folder/b.md").map(String::as_str),
            Some("new_folder/b.md")
        );
        assert_eq!(
            map.get("old_folder/sub/c.md").map(String::as_str),
            Some("new_folder/sub/c.md")
        );
        assert_eq!(map.len(), 3, "non-md files should be excluded");
    }

    #[test]
    fn build_folder_map_returns_empty_for_missing_new_root() {
        let temp = tempfile::tempdir().expect("tempdir");
        let map = build_folder_move_path_map(temp.path(), "old", "does_not_exist");
        assert!(map.is_empty());
    }
}
