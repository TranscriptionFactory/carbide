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
    pub total_notes: usize,
    pub embedded_notes: usize,
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
    pub size_bytes: i64,
    #[serde(default)]
    pub file_type: Option<String>,
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
}

#[derive(Debug, Serialize, Deserialize, Clone, Default, Type)]
pub struct NoteStats {
    pub word_count: i64,
    pub char_count: i64,
    pub heading_count: i64,
    pub outlink_count: i64,
    pub reading_time_secs: i64,
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
}
