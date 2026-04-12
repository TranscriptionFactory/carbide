use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

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

pub fn rename_note(
    app: &AppHandle,
    vault_id: &str,
    from: &str,
    to: &str,
) -> Result<String, OpError> {
    notes_service::rename_note(
        NoteRenameArgs {
            vault_id: vault_id.to_string(),
            from: from.to_string(),
            to: to.to_string(),
        },
        app.clone(),
    )
    .map_err(OpError::Internal)?;
    Ok(to.to_string())
}

pub fn move_note(app: &AppHandle, vault_id: &str, path: &str, to: &str) -> Result<String, OpError> {
    let results = notes_service::move_items(
        MoveItemsArgs {
            vault_id: vault_id.to_string(),
            items: vec![MoveItem {
                path: path.to_string(),
                is_folder: false,
            }],
            target_folder: to.to_string(),
            overwrite: false,
        },
        app.clone(),
    )
    .map_err(OpError::Internal)?;

    match results.into_iter().next() {
        Some(r) if r.success => Ok(r.new_path),
        Some(r) => Err(OpError::Internal(
            r.error.unwrap_or_else(|| "move failed".into()),
        )),
        None => Err(OpError::Internal("no move result".into())),
    }
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
        search_db::search(conn, query, SearchScope::All, limit)
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
}
