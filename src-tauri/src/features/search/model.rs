use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::BTreeMap;

#[derive(Debug, Serialize, Clone, Type)]
pub struct SemanticSearchHit {
    pub note: IndexNoteMeta,
    pub distance: f32,
}

#[derive(Debug, Serialize, Clone, Type)]
pub struct BatchSemanticEdge {
    pub source: String,
    pub target: String,
    pub distance: f32,
}

#[derive(Debug, Deserialize, Clone, Copy, Type)]
pub struct DateRange {
    pub start_ms: i64,
    pub end_ms: i64,
}

#[derive(Debug, Serialize, Clone, Type)]
#[serde(rename_all = "camelCase")]
pub struct BlockSearchHit {
    pub path: String,
    pub heading_id: String,
    pub distance: f32,
}

#[derive(Debug, Serialize, Clone, Type)]
pub struct BlockSectionHit {
    pub note: IndexNoteMeta,
    pub heading_id: String,
    pub heading: String,
    pub start_line: u32,
    pub end_line: u32,
    pub distance: f32,
}

/// `score` is cosine similarity (`1 - index distance`), so higher is closer —
/// the opposite polarity of every `distance` field in this file.
#[derive(Debug, Serialize, Clone, PartialEq, Type)]
pub struct MissingLinkHit {
    pub source_heading_id: String,
    pub source_start_line: i64,
    pub source_end_line: i64,
    pub target_path: String,
    pub score: f32,
}

#[derive(Debug, Serialize, Clone, PartialEq, Type)]
#[serde(rename_all = "snake_case")]
pub enum HitSource {
    Fts,
    Vector,
    Both,
}

#[derive(Debug, Serialize, Clone, Type)]
pub struct HybridSearchHit {
    pub note: IndexNoteMeta,
    pub score: f32,
    pub snippet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet_page: Option<u32>,
    pub source: HitSource,
}

#[derive(Debug, Serialize, Clone, Type)]
pub struct EmbeddingStatus {
    /// Every non-hidden file the index knows about, embeddable or not.
    pub total_notes: usize,
    /// Raw `note_embeddings` row count, stale and out-of-scope vectors included.
    pub embedded_notes: usize,
    /// The part of `total_notes` the embed pass selects under the current scope.
    /// Attachments, code outside `all`, and empty notes are not in it, which is
    /// why readiness must be read from this pair rather than from the raw counts.
    pub eligible_notes: usize,
    /// How much of `eligible_notes` has a vector. Never exceeds it: a stale or
    /// out-of-scope vector is in neither count.
    pub embedded_eligible_notes: usize,
    /// Notes in the index the pass deliberately skips: an attachment, code
    /// outside `all`, or an empty body is ineligible by construction, not left
    /// behind by a failed pass. The eligible notes it did not reach are the
    /// `eligible_notes - embedded_eligible_notes` deficit instead.
    pub skipped_notes: usize,
    /// Whether an embedding attempt has ended under the scope resolved now.
    /// `is_embedding == false` alone does not mean this: startup may not have
    /// queued an attempt yet, and a cancelled pass has not finished anything.
    pub embed_attempt_completed: bool,
    /// False only when both note and block embedding are switched off, so no
    /// pass can do any work. Readiness has nothing pending to report then, and
    /// must not hold a banner over a deliberate configuration.
    pub embedding_enabled: bool,
    pub model_version: String,
    pub is_embedding: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct IndexNoteMeta {
    pub id: String,
    pub path: String,
    pub title: String,
    pub name: String,
    pub mtime_ms: i64,
    pub ctime_ms: i64,
    pub size_bytes: i64,
    // The one-line gist, read from notes.content_snippet. Empty on the queries
    // that do not select it (the bulk sync diff) and on metas built before a
    // note is indexed, so a consumer must treat "" as "unknown", not "blank".
    #[serde(default)]
    pub blurb: String,
    #[serde(default)]
    pub file_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default, Type)]
pub struct LinkedSourceMeta {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub citekey: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub authors: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub doi: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub isbn: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arxiv_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub journal: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub r#abstract: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub item_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub external_file_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub linked_source_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vault_relative_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub home_relative_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct LinkedNoteInfo {
    pub path: String,
    pub title: String,
    pub mtime_ms: i64,
    pub citekey: Option<String>,
    pub authors: Option<String>,
    pub year: Option<i32>,
    pub doi: Option<String>,
    pub item_type: Option<String>,
    pub external_file_path: Option<String>,
    pub linked_source_id: Option<String>,
    pub vault_relative_path: Option<String>,
    pub home_relative_path: Option<String>,
    pub journal: Option<String>,
    pub abstract_text: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Copy, Type)]
#[serde(rename_all = "snake_case")]
pub enum SearchScope {
    All,
    Path,
    Title,
    Content,
}

#[derive(Debug, Serialize, Type)]
pub struct SearchHit {
    pub note: IndexNoteMeta,
    pub score: f32,
    pub snippet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet_page: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct PropertyValue {
    pub value: String,
    pub property_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct BaseNoteRow {
    pub note: IndexNoteMeta,
    pub properties: BTreeMap<String, PropertyValue>,
    pub tags: Vec<String>,
    pub stats: NoteStats,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_snippet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_image_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default, Type)]
pub struct NoteStats {
    pub word_count: i64,
    pub char_count: i64,
    pub heading_count: i64,
    pub outlink_count: i64,
    pub reading_time_secs: i64,
    pub task_count: i64,
    pub tasks_done: i64,
    pub tasks_todo: i64,
    pub next_due_date: Option<String>,
    pub last_indexed_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct BaseQueryResults {
    pub rows: Vec<BaseNoteRow>,
    pub total: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct BaseFilter {
    pub property: String,
    pub operator: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct BaseSort {
    pub property: String,
    pub descending: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct BaseQuery {
    pub filters: Vec<BaseFilter>,
    pub sort: Vec<BaseSort>,
    pub limit: usize,
    pub offset: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct PropertyInfo {
    pub name: String,
    pub property_type: String,
    pub count: usize,
    pub unique_values: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct TagInfo {
    pub tag: String,
    pub count: usize,
    pub promoted: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct NoteHeading {
    pub level: i32,
    pub text: String,
    pub line: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct HeadingMatch {
    pub note_path: String,
    pub level: i32,
    pub text: String,
    pub line: i64,
    /// Slash-joined ancestry, e.g. "Project A/Subproject B/Tasks".
    pub heading_path: String,
    /// Match quality in [0, 1]. Mirrors the P4.1 omnibar rule.
    pub score: f64,
}

/// Filter for the section (heading) query noun. Every field is optional except
/// `limit`; `title_is_regex` selects whether `title` is a regex or a
/// case-insensitive substring.
#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct SectionFilter {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub title_is_regex: bool,
    #[serde(default)]
    pub level_min: Option<i32>,
    #[serde(default)]
    pub level_max: Option<i32>,
    #[serde(default)]
    pub path_prefix: Option<String>,
    /// Matches this heading path and everything nested under it.
    #[serde(default)]
    pub heading_path_under: Option<String>,
    #[serde(default)]
    pub min_words: Option<i64>,
    pub limit: usize,
}

/// One `note_sections` row with its note meta. Lines are 0-based, matching the
/// index and the `note.open` `line` argument.
#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct SectionHit {
    pub note: IndexNoteMeta,
    pub heading_id: String,
    pub title: String,
    pub level: i32,
    pub heading_path: String,
    pub start_line: i64,
    pub end_line: i64,
    pub word_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct NoteLink {
    pub target_path: String,
    pub link_text: String,
    pub link_type: String,
    pub section_heading: Option<String>,
    pub target_anchor: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct FileCache {
    pub frontmatter: BTreeMap<String, (String, String)>,
    pub tags: Vec<String>,
    pub headings: Vec<NoteHeading>,
    pub links: Vec<NoteLink>,
    pub embeds: Vec<NoteLink>,
    pub stats: NoteStats,
    pub ctime_ms: i64,
    pub mtime_ms: i64,
    pub size_bytes: i64,
}
