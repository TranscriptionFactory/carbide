use crate::features::search::model::IndexNoteMeta;
use serde::Serialize;

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct GraphNoteMeta {
    pub id: String,
    pub path: String,
    pub title: String,
    pub name: String,
    pub mtime_ms: i64,
    pub size_bytes: i64,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct GraphOrphanLink {
    pub target_path: String,
    pub ref_count: i64,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct GraphNeighborhoodStats {
    pub node_count: usize,
    pub edge_count: usize,
    pub backlink_count: usize,
    pub outlink_count: usize,
    pub orphan_count: usize,
    pub bidirectional_count: usize,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct GraphNeighborhoodSnapshot {
    pub center: GraphNoteMeta,
    pub backlinks: Vec<GraphNoteMeta>,
    pub outlinks: Vec<GraphNoteMeta>,
    pub orphan_links: Vec<GraphOrphanLink>,
    pub stats: GraphNeighborhoodStats,
}

#[derive(Debug, Serialize, Clone)]
pub struct GraphCacheStatsSnapshot {
    pub size: usize,
    pub hits: u64,
    pub misses: u64,
    pub insertions: u64,
    pub evictions: u64,
    pub hit_rate: f64,
}

impl From<IndexNoteMeta> for GraphNoteMeta {
    fn from(value: IndexNoteMeta) -> Self {
        Self {
            id: value.id,
            path: value.path,
            title: value.title,
            name: value.name,
            mtime_ms: value.mtime_ms,
            size_bytes: value.size_bytes,
        }
    }
}
