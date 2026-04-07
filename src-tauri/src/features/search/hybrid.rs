use crate::features::search::db as search_db;
use crate::features::search::embeddings::EmbeddingService;
use crate::features::search::model::{HitSource, HybridSearchHit, SearchHit, SearchScope};
use crate::features::search::vector_db;
use rusqlite::Connection;
use std::collections::HashMap;

pub fn hybrid_search(
    conn: &Connection,
    model: &EmbeddingService,
    query: &str,
    limit: usize,
) -> Result<Vec<HybridSearchHit>, String> {
    let query_vec = model.embed_one(query)?;

    let over_fetch = limit * 3;

    let vector_hits = vector_db::knn_search(conn, &query_vec, over_fetch).unwrap_or_default();

    let fts_hits = search_db::search(conn, query, SearchScope::All, over_fetch).unwrap_or_default();

    let merged = rrf_merge(&fts_hits, &vector_hits, limit, query);

    Ok(merged)
}

fn rrf_merge(
    fts_hits: &[SearchHit],
    vector_hits: &[(String, f32)],
    limit: usize,
    query: &str,
) -> Vec<HybridSearchHit> {
    const K: f64 = 60.0;

    let mut scores: HashMap<String, (f64, HitSource)> = HashMap::new();

    for (rank, hit) in fts_hits.iter().enumerate() {
        let rrf_score = 1.0 / (K + rank as f64 + 1.0);
        let entry = scores
            .entry(hit.note.path.clone())
            .or_insert((0.0, HitSource::Fts));
        entry.0 += rrf_score;
    }

    for (rank, (path, _distance)) in vector_hits.iter().enumerate() {
        let rrf_score = 1.0 / (K + rank as f64 + 1.0);
        let entry = scores
            .entry(path.clone())
            .or_insert((0.0, HitSource::Vector));
        if entry.1 == HitSource::Fts {
            entry.1 = HitSource::Both;
        }
        entry.0 += rrf_score;
    }

    let fts_map: HashMap<&str, &SearchHit> =
        fts_hits.iter().map(|h| (h.note.path.as_str(), h)).collect();

    let query_lower = query.to_lowercase();
    let query_terms: Vec<&str> = query_lower.split_whitespace().collect();

    let mut results: Vec<HybridSearchHit> = scores
        .into_iter()
        .filter_map(|(path, (base_score, source))| {
            let fts_hit = fts_map.get(path.as_str());
            let note = fts_hit.map(|h| h.note.clone())?;

            let title_lower = note.title.to_lowercase();
            let mut final_score = base_score;

            let term_overlap = query_terms
                .iter()
                .filter(|t| title_lower.contains(**t))
                .count() as f64
                / query_terms.len().max(1) as f64;
            final_score += term_overlap * 0.3;

            if title_lower.contains(&query_lower) {
                final_score += 0.3;
            }

            let snippet = fts_hit.and_then(|h| h.snippet.clone());
            let snippet_page = fts_hit.and_then(|h| h.snippet_page);

            Some(HybridSearchHit {
                note,
                score: final_score as f32,
                snippet,
                snippet_page,
                source,
            })
        })
        .collect();

    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    results.truncate(limit);
    results
}
