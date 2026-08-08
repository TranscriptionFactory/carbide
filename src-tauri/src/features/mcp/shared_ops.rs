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

#[derive(Debug)]
pub enum OpError {
    NotFound(String),
    BadRequest(String),
    Conflict(String),
    Internal(String),
}

/// Canonical description for a `vault_id` property that a tool can resolve from
/// the active vault when omitted. Kept as a single constant so every tool that
/// promises the fallback uses identical wording (asserted by the schema
/// consistency test).
pub const VAULT_ID_OPTIONAL_DESC: &str = "Vault identifier (optional if an active vault is set)";

/// Resolve an optional `vault_id` argument to a concrete vault id, falling back
/// to the active vault when the argument is absent or empty. Errors with a
/// clear message when neither is available, instead of a cryptic serde error.
pub fn resolve_vault_id(app: &AppHandle, vault_id: Option<String>) -> Result<String, OpError> {
    match vault_id.filter(|v| !v.trim().is_empty()) {
        Some(id) => Ok(id),
        None => get_active_vault_id(app)?.ok_or_else(|| {
            OpError::BadRequest(
                "No vault_id provided and no active vault is set; pass vault_id or open a vault first."
                    .into(),
            )
        }),
    }
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

#[derive(Default, Serialize, Deserialize)]
pub struct VaultPathArgs {
    pub vault_id: String,
    pub path: String,
}

#[derive(Default, Serialize, Deserialize)]
pub struct VaultIdArgs {
    pub vault_id: String,
}

#[derive(Default, Serialize, Deserialize)]
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

#[derive(Default, Serialize, Deserialize)]
pub struct CreateNoteArgs {
    pub vault_id: String,
    pub path: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub overwrite: bool,
}

#[derive(Default, Serialize, Deserialize)]
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

    notes_service::create_note_inner(
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

/// Apply a unique-match string edit, mirroring the standard Edit contract:
/// `old_string` must occur exactly once unless `replace_all` is set. Pure and
/// side-effect free so the match semantics can be unit tested without a vault.
pub fn apply_edit(
    content: &str,
    old_string: &str,
    new_string: &str,
    replace_all: bool,
) -> Result<String, OpError> {
    if old_string.is_empty() {
        return Err(OpError::BadRequest("old_string must not be empty".into()));
    }
    if old_string == new_string {
        return Err(OpError::BadRequest(
            "old_string and new_string are identical; nothing to change".into(),
        ));
    }

    let count = content.matches(old_string).count();
    if count == 0 {
        return Err(OpError::NotFound(describe_missing_old_string(
            content, old_string,
        )));
    }
    if count > 1 && !replace_all {
        return Err(OpError::BadRequest(format!(
            "old_string is not unique ({count} matches, at {}); add surrounding context to disambiguate or set replace_all=true",
            describe_match_lines(content, old_string)
        )));
    }

    let updated = if replace_all {
        content.replace(old_string, new_string)
    } else {
        content.replacen(old_string, new_string, 1)
    };
    Ok(updated)
}

/// Ordered so that each rung includes the ones above it, and so that line
/// endings are normalized before anything line-wise — otherwise a CRLF note
/// masks a trailing-space difference and gets misdiagnosed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EditDrift {
    LineEndings,
    TrailingWhitespace,
    Indentation,
    Punctuation,
}

const DRIFT_LADDER: [EditDrift; 4] = [
    EditDrift::LineEndings,
    EditDrift::TrailingWhitespace,
    EditDrift::Indentation,
    EditDrift::Punctuation,
];

/// Cap on the occurrence list, so an ambiguous match in a long note cannot push
/// the directive sentence past the tool-result truncation limit.
const MAX_REPORTED_LINES: usize = 10;

impl EditDrift {
    fn label(self) -> &'static str {
        match self {
            EditDrift::LineEndings => "line endings",
            EditDrift::TrailingWhitespace => "trailing whitespace",
            EditDrift::Indentation => "leading indentation",
            EditDrift::Punctuation => "typographic punctuation",
        }
    }

    fn guidance(self) -> &'static str {
        match self {
            EditDrift::LineEndings => "the note's lines end differently from the ones you sent",
            EditDrift::TrailingWhitespace => "keep the spaces at the end of each line",
            EditDrift::Indentation => "keep the note's leading indentation exactly",
            EditDrift::Punctuation => {
                "the note uses curly quotes or dashes where old_string uses ASCII, or the reverse"
            }
        }
    }

    fn apply(self, text: &str) -> String {
        match self {
            EditDrift::LineEndings => text.replace("\r\n", "\n"),
            EditDrift::TrailingWhitespace => {
                map_lines(text, |line| line.trim_end_matches([' ', '\t']))
            }
            EditDrift::Indentation => map_lines(text, |line| line.trim_start_matches([' ', '\t'])),
            EditDrift::Punctuation => to_ascii_punctuation(text),
        }
    }
}

fn map_lines(text: &str, transform: impl Fn(&str) -> &str) -> String {
    text.split('\n').map(transform).collect::<Vec<_>>().join("\n")
}

fn to_ascii_punctuation(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '\u{2018}' | '\u{2019}' | '\u{201b}' | '\u{2032}' => out.push('\''),
            '\u{201c}' | '\u{201d}' | '\u{201f}' | '\u{2033}' => out.push('"'),
            '\u{2010}'..='\u{2015}' => out.push('-'),
            '\u{2026}' => out.push_str("..."),
            '\u{00a0}' | '\u{2007}' | '\u{202f}' => out.push(' '),
            other => out.push(other),
        }
    }
    out
}

fn normalize_through(text: &str, rung: EditDrift) -> String {
    let mut out = text.to_string();
    for step in DRIFT_LADDER {
        out = step.apply(&out);
        if step == rung {
            break;
        }
    }
    out
}

/// A local model's near-miss is almost never arbitrary — it is trailing-space
/// drift, CRLF, re-indentation or a smart quote. Retrying the exact search under
/// progressively looser normalizations identifies *which*, so the report names
/// the difference instead of leaving the model to guess across its remaining
/// iterations. The near-match is only ever described, never applied: silently
/// fuzzy-editing someone's notes is worse than failing.
fn describe_missing_old_string(content: &str, old_string: &str) -> String {
    for rung in DRIFT_LADDER {
        let haystack = normalize_through(content, rung);
        let needle = normalize_through(old_string, rung);
        if needle.is_empty() {
            continue;
        }
        let count = haystack.matches(&needle).count();
        if count > 0 {
            return near_miss_message(rung, count);
        }
    }

    match find_similar_section(content, old_string) {
        Some(section) => similar_section_message(&section),
        None => "old_string was not found in the note, and nothing in it is close. \
                 The note may have changed — re-read it with read_note before editing again."
            .to_string(),
    }
}

/// Above this, the text is close enough that pointing at it is more useful than
/// declaring the note unrecognizable; below it, naming a region would send the
/// model to edit the wrong place.
const SECTION_MATCH_THRESHOLD: f64 = 0.9;
const MAX_EXCERPT_LINES: usize = 6;

struct SimilarSection {
    start_line: usize,
    end_line: usize,
    similarity: f64,
    text: String,
}

/// No normalization rung matched, so the text genuinely differs — the useful
/// answer is no longer *what* changed but *where*. Slide `old_string`'s own line
/// count as a window over the note and keep the best-scoring region.
fn find_similar_section(content: &str, old_string: &str) -> Option<SimilarSection> {
    let lines: Vec<&str> = content.lines().collect();
    let window = old_string.lines().count();
    if window == 0 || window > lines.len() {
        return None;
    }

    lines
        .windows(window)
        .enumerate()
        .map(|(index, region)| {
            let text = region.join("\n");
            SimilarSection {
                start_line: index + 1,
                end_line: index + window,
                similarity: strsim::jaro_winkler(old_string, &text),
                text,
            }
        })
        .filter(|section| section.similarity >= SECTION_MATCH_THRESHOLD)
        .max_by(|a, b| a.similarity.total_cmp(&b.similarity))
}

/// The directive comes before the excerpt: tool results are truncated head-only,
/// so anything the model must act on has to survive a long quote being cut.
fn similar_section_message(section: &SimilarSection) -> String {
    format!(
        "old_string was not found in the note. The closest text is lines {}-{} ({:.0}% similar) — \
         copy old_string from those lines exactly, or re-read the note with read_note if it has \
         changed since. Those lines are:\n{}",
        section.start_line,
        section.end_line,
        section.similarity * 100.0,
        excerpt(&section.text)
    )
}

fn excerpt(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let mut out = lines[..lines.len().min(MAX_EXCERPT_LINES)].join("\n");
    if lines.len() > MAX_EXCERPT_LINES {
        out.push_str("\n…");
    }
    out
}

fn near_miss_message(rung: EditDrift, count: usize) -> String {
    let mut message = format!(
        "old_string was not found in the note. The same text is present but differs in {} — {}. \
         Re-read the note with read_note and copy old_string out of it exactly.",
        rung.label(),
        rung.guidance()
    );
    if count > 1 {
        message.push_str(&format!(
            " It appears that way in {count} places, so include enough surrounding context to make the match unique."
        ));
    }
    message
}

/// Start line of each occurrence, 1-based. A bare count tells the model only
/// that it failed; line numbers tell it where to look for disambiguating
/// context.
fn describe_match_lines(content: &str, needle: &str) -> String {
    let lines: Vec<String> = content
        .match_indices(needle)
        .map(|(offset, _)| (content[..offset].matches('\n').count() + 1).to_string())
        .collect();
    let shown = lines.len().min(MAX_REPORTED_LINES);
    let rest = lines.len() - shown;
    let list = lines[..shown].join(", ");
    if rest == 0 {
        format!("lines {list}")
    } else {
        format!("lines {list} and {rest} more")
    }
}

pub fn edit_note(
    app: &AppHandle,
    vault_id: &str,
    path: &str,
    old_string: &str,
    new_string: &str,
    replace_all: bool,
) -> Result<(String, usize), OpError> {
    let (_, abs) = resolve_read_path(app, vault_id, path)?;
    let existing = std::fs::read_to_string(&abs)
        .map_err(|e| OpError::NotFound(format!("Failed to read note: {}", e)))?;

    let replacements = if replace_all {
        existing.matches(old_string).count().max(1)
    } else {
        1
    };
    let updated = apply_edit(&existing, old_string, new_string, replace_all)?;

    io_utils::atomic_write(&abs, updated.as_bytes()).map_err(OpError::Internal)?;
    Ok((path.to_string(), replacements))
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

    let results = notes_service::move_items_inner(
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
    notes_service::delete_note_inner(
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
        notes_service::list_notes_inner(app.clone(), vault_id.to_string()).map_err(OpError::Internal)?;

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

    search_service::index_search_inner(app.clone(), vault_id.to_string(), query_input, Some(limit))
        .map(|hits| {
            hits.into_iter()
                .take(limit)
                .map(|mut h| {
                    // BM25 is negative (more negative = better); negate so all
                    // MCP-exposed scores are positive higher-is-better.
                    h.score = -h.score;
                    h
                })
                .collect()
        })
        .map_err(OpError::Internal)
}

/// On semantic failure falls back to FTS; the second tuple element carries the
/// fallback reason so callers can surface the degradation.
pub fn search_notes_hybrid(
    app: &AppHandle,
    vault_id: &str,
    query: &str,
    limit: usize,
) -> Result<(Vec<crate::features::search::model::HybridSearchHit>, Option<String>), OpError> {
    match search_service::hybrid_search_sync(app, vault_id, query, limit) {
        Ok(hits) => Ok((hits, None)),
        Err(err) => {
            log::warn!("semantic search unavailable, falling back to FTS: {err}");
            search_notes_index(app, vault_id, query, limit).map(|hits| {
                let hits = hits
                    .into_iter()
                    .map(|h| crate::features::search::model::HybridSearchHit {
                        note: h.note,
                        score: h.score,
                        snippet: h.snippet,
                        snippet_page: None,
                        source: crate::features::search::model::HitSource::Fts,
                    })
                    .collect();
                (hits, Some(err))
            })
        }
    }
}

pub fn list_vaults(app: &AppHandle) -> Result<Vec<crate::shared::storage::Vault>, OpError> {
    vault_service::list_vaults_inner(app.clone()).map_err(OpError::Internal)
}

pub fn get_vault(
    app: &AppHandle,
    vault_id: &str,
) -> Result<crate::shared::storage::Vault, OpError> {
    let vaults = vault_service::list_vaults_inner(app.clone()).map_err(OpError::Internal)?;
    vaults
        .into_iter()
        .find(|v| v.id == vault_id)
        .ok_or_else(|| OpError::NotFound("Vault not found".into()))
}

pub fn get_active_vault_id(app: &AppHandle) -> Result<Option<String>, OpError> {
    vault_service::get_last_vault_id_inner(app.clone()).map_err(OpError::Internal)
}

pub fn reindex(app: &AppHandle, vault_id: &str) -> Result<(), OpError> {
    search_service::index_rebuild_inner(app.clone(), vault_id.to_string()).map_err(OpError::Internal)
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
        search_service::get_note_stats_inner(app.clone(), vault_id.to_string(), path.to_string()).ok();

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
    notes_service::rename_note_inner(
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
        let _ = search_service::index_upsert_note_inner(
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
    fn apply_edit_replaces_unique_match() {
        let out = apply_edit("hello world", "world", "there", false).unwrap();
        assert_eq!(out, "hello there");
    }

    #[test]
    fn apply_edit_errors_when_not_found() {
        let err = apply_edit("hello world", "missing", "x", false);
        assert!(matches!(err, Err(OpError::NotFound(_))));
    }

    #[test]
    fn apply_edit_errors_on_ambiguous_match() {
        let err = apply_edit("a a a", "a", "b", false);
        assert!(matches!(err, Err(OpError::BadRequest(_))));
    }

    fn edit_error(content: &str, old_string: &str) -> String {
        match apply_edit(content, old_string, "REPLACED", false) {
            Err(OpError::NotFound(message)) | Err(OpError::BadRequest(message)) => message,
            other => panic!("expected a near-miss report, got {other:?}"),
        }
    }

    #[test]
    fn apply_edit_names_trailing_whitespace_drift() {
        let error = edit_error("- alpha  \n- beta\n", "- alpha\n- beta");

        assert!(error.contains("trailing whitespace"), "{error}");
        assert!(error.contains("read_note"), "{error}");
    }

    #[test]
    fn apply_edit_names_line_ending_drift() {
        let error = edit_error("alpha\r\nbeta\r\n", "alpha\nbeta");

        assert!(error.contains("line endings"), "{error}");
    }

    #[test]
    fn apply_edit_names_indentation_drift() {
        let error = edit_error("    let x = 1;\n    let y = 2;\n", "let x = 1;\nlet y = 2;");

        assert!(error.contains("leading indentation"), "{error}");
    }

    #[test]
    fn apply_edit_names_typographic_punctuation_drift() {
        let error = edit_error("the model\u{2019}s \u{201c}answer\u{201d}", "the model's \"answer\"");

        assert!(error.contains("typographic punctuation"), "{error}");
    }

    /// A near-miss is diagnosed, never applied — a fuzzy edit to someone's notes
    /// is worse than a failed one.
    #[test]
    fn apply_edit_never_applies_a_near_miss() {
        let content = "    let x = 1;\n    let y = 2;\n";
        let result = apply_edit(content, "let x = 1;\nlet y = 2;", "gone", false);

        assert!(matches!(result, Err(OpError::NotFound(_))));
    }

    #[test]
    fn apply_edit_reports_a_repeated_near_miss_as_ambiguous() {
        let error = edit_error("  foo\n  bar\n\n  foo\n  bar\n", "foo\nbar");

        assert!(error.contains("leading indentation"), "{error}");
        assert!(error.contains("surrounding context"), "{error}");
    }

    /// Nothing in the note resembles the text, so pointing at a region would
    /// only send the model to edit the wrong place.
    #[test]
    fn apply_edit_below_the_similarity_threshold_directs_a_re_read() {
        let error = edit_error("hello world", "nothing like this at all");

        assert!(error.contains("nothing in it is close"), "{error}");
        assert!(error.contains("read_note"), "{error}");
        assert!(!error.contains("similar"), "{error}");
    }

    /// Genuinely different text — no normalization rung can match it — so the
    /// useful answer is where the closest region is.
    #[test]
    fn apply_edit_locates_the_closest_region_by_similarity() {
        let content = "# Notes\n\nThe quick brown fox jumps over the lazy dog.\n\n## End\n";
        let error = edit_error(content, "The quick brown fox jumps over the lazy cat.");

        assert!(error.contains("lines 3-3"), "{error}");
        assert!(error.contains("% similar"), "{error}");
        assert!(error.contains("The quick brown fox"), "{error}");
    }

    /// Truncation is head-only, so the instruction has to precede the quote.
    #[test]
    fn apply_edit_puts_the_directive_before_the_excerpt() {
        let content = "# Notes\n\nThe quick brown fox jumps over the lazy dog.\n";
        let error = edit_error(content, "The quick brown fox jumps over the lazy cat.");

        let directive = error.find("copy old_string").expect("directive");
        let quote = error.find("The quick brown fox jumps over the lazy dog").expect("quote");
        assert!(directive < quote, "{error}");
    }

    #[test]
    fn apply_edit_bounds_the_reported_excerpt() {
        let body = (0..40)
            .map(|n| format!("line {n} of the note body"))
            .collect::<Vec<_>>()
            .join("\n");
        let old_string = (0..40)
            .map(|n| format!("line {n} of the note bodyy"))
            .collect::<Vec<_>>()
            .join("\n");

        let error = edit_error(&body, &old_string);

        assert!(error.contains('…'), "{error}");
        assert!(
            error.lines().count() <= MAX_EXCERPT_LINES + 3,
            "excerpt was not bounded: {error}"
        );
    }

    #[test]
    fn apply_edit_names_the_line_of_each_ambiguous_occurrence() {
        let error = edit_error("intro\nfoo\nbar\nfoo\n", "foo");

        assert!(error.contains("lines 2, 4"), "{error}");
    }

    #[test]
    fn apply_edit_caps_the_reported_occurrence_lines() {
        let content = "dup\n".repeat(15);
        let error = edit_error(&content, "dup");

        assert!(error.contains("and 5 more"), "{error}");
    }

    #[test]
    fn apply_edit_replace_all_rewrites_every_occurrence() {
        let out = apply_edit("a a a", "a", "b", true).unwrap();
        assert_eq!(out, "b b b");
    }

    #[test]
    fn apply_edit_replace_all_still_errors_when_absent() {
        let err = apply_edit("a a a", "z", "b", true);
        assert!(matches!(err, Err(OpError::NotFound(_))));
    }

    #[test]
    fn apply_edit_rejects_empty_old_string() {
        let err = apply_edit("content", "", "x", false);
        assert!(matches!(err, Err(OpError::BadRequest(_))));
    }

    #[test]
    fn apply_edit_rejects_noop_edit() {
        let err = apply_edit("content", "same", "same", false);
        assert!(matches!(err, Err(OpError::BadRequest(_))));
    }

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
