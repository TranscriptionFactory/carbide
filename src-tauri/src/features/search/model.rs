use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Serialize, Clone)]
pub struct SemanticSearchHit {
    pub note: IndexNoteMeta,
    pub distance: f32,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum HitSource {
    Fts,
    Vector,
    Both,
}

#[derive(Debug, Serialize, Clone)]
pub struct HybridSearchHit {
    pub note: IndexNoteMeta,
    pub score: f32,
    pub snippet: Option<String>,
    pub source: HitSource,
}

#[derive(Debug, Serialize, Clone)]
pub struct EmbeddingStatus {
    pub total_notes: usize,
    pub embedded_notes: usize,
    pub model_version: String,
    pub is_embedding: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexNoteMeta {
    pub id: String,
    pub path: String,
    pub title: String,
    pub name: String,
    pub mtime_ms: i64,
    pub size_bytes: i64,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum SearchScope {
    All,
    Path,
    Title,
    Content,
}

#[derive(Debug, Serialize)]
pub struct SearchHit {
    pub note: IndexNoteMeta,
    pub score: f32,
    pub snippet: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PropertyValue {
    pub value: String,
    pub property_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BaseNoteRow {
    pub note: IndexNoteMeta,
    pub properties: BTreeMap<String, PropertyValue>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BaseQueryResults {
    pub rows: Vec<BaseNoteRow>,
    pub total: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BaseFilter {
    pub property: String,
    pub operator: String, // "eq", "neq", "contains", "gt", "lt", etc.
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BaseSort {
    pub property: String,
    pub descending: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BaseQuery {
    pub filters: Vec<BaseFilter>,
    pub sort: Vec<BaseSort>,
    pub limit: usize,
    pub offset: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PropertyInfo {
    pub name: String,
    pub property_type: String,
    pub count: usize,
}
