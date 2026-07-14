use crate::features::search::db as search_db;
use crate::features::search::embeddings::EmbeddingService;
use crate::features::search::hnsw_index::VectorIndex;
use crate::features::search::model::{HitSource, HybridSearchHit, SearchHit};
use crate::features::search::service::SearchQueryInput;
use rusqlite::Connection;
use std::collections::{HashMap, HashSet};

pub fn hybrid_search(
    conn: &Connection,
    note_index: &VectorIndex,
    model: &EmbeddingService,
    query: &SearchQueryInput,
    limit: usize,
    date_range: Option<(i64, i64)>,
) -> Result<Vec<HybridSearchHit>, String> {
    let query_vec = model.embed_one(&query.text)?;

    let over_fetch = limit * 3;
    // FTS pushes the date filter into SQL, but the vector index has no filter
    // API, so we over-fetch and filter afterward. For a narrow window in a
    // very large vault the in-range notes may fall outside this pool; FTS still
    // covers those, so retrieval degrades rather than failing.
    let vector_fetch = if date_range.is_some() {
        (limit * 20).max(500)
    } else {
        over_fetch
    };

    let mut vector_hits = note_index.search(&query_vec, vector_fetch);

    let fts_hits =
        search_db::search(conn, &query.text, query.scope, over_fetch, date_range).unwrap_or_default();

    if let Some((start_ms, end_ms)) = date_range {
        let allowed = search_db::paths_in_mtime_range(conn, start_ms, end_ms)?;
        vector_hits.retain(|(path, _)| allowed.contains(path));
        vector_hits.truncate(over_fetch);
    }

    let merged = rrf_merge(conn, &fts_hits, &vector_hits, limit, &query.text);

    Ok(merged)
}

fn rrf_merge(
    conn: &Connection,
    fts_hits: &[SearchHit],
    vector_hits: &[(String, f32)],
    limit: usize,
    query: &str,
) -> Vec<HybridSearchHit> {
    const K: f64 = 60.0;
    // Title boosts act like one extra RRF list (max ~1/K total) so rank fusion
    // stays the primary signal; whole-word matching keeps substring/stopword
    // hits ("the" in "theory") from counting.
    const TITLE_BONUS: f64 = 0.5 / K;

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
    let query_terms: Vec<&str> = query_lower
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .collect();

    let mut results: Vec<HybridSearchHit> = scores
        .into_iter()
        .filter_map(|(path, (base_score, source))| {
            let fts_hit = fts_map.get(path.as_str());
            let note = if let Some(h) = fts_hit {
                h.note.clone()
            } else {
                match search_db::get_note_meta(conn, &path) {
                    Ok(Some(meta)) => meta,
                    _ => return None,
                }
            };

            let title_lower = note.title.to_lowercase();
            let title_words: HashSet<&str> = title_lower
                .split(|c: char| !c.is_alphanumeric())
                .filter(|w| !w.is_empty())
                .collect();
            let mut final_score = base_score;

            let term_overlap = query_terms
                .iter()
                .filter(|t| title_words.contains(**t))
                .count() as f64
                / query_terms.len().max(1) as f64;
            final_score += term_overlap * TITLE_BONUS;

            if term_overlap == 1.0 && title_lower.contains(&query_lower) {
                final_score += TITLE_BONUS;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::search::model::IndexNoteMeta;

    fn hit(path: &str, title: &str) -> SearchHit {
        SearchHit {
            note: IndexNoteMeta {
                id: path.into(),
                path: path.into(),
                title: title.into(),
                name: path.trim_end_matches(".md").into(),
                mtime_ms: 0,
                ctime_ms: 0,
                size_bytes: 0,
                file_type: None,
                source: None,
            },
            score: -1.0,
            snippet: None,
            snippet_page: None,
        }
    }

    // All candidates appear in fts_hits, so rrf_merge never touches the conn.
    fn merge(fts: &[SearchHit], vector: &[(String, f32)], query: &str) -> Vec<HybridSearchHit> {
        let conn = Connection::open_in_memory().expect("in-memory db");
        rrf_merge(&conn, fts, vector, 10, query)
    }

    #[test]
    fn dual_rank_one_outranks_deep_title_match() {
        let mut fts = vec![hit("a.md", "Unrelated Alpha")];
        for i in 0..8 {
            fts.push(hit(&format!("filler{i}.md"), "Filler Note"));
        }
        fts.push(hit("t.md", "Machine Learning"));
        let vector = vec![("a.md".to_string(), 0.1f32)];

        let results = merge(&fts, &vector, "machine learning");
        assert_eq!(results[0].note.path, "a.md");
    }

    #[test]
    fn title_match_breaks_near_ties() {
        let fts = vec![hit("a.md", "Plain Note"), hit("b.md", "Machine Learning")];

        let results = merge(&fts, &[], "machine learning");
        assert_eq!(results[0].note.path, "b.md");
    }

    #[test]
    fn stopword_substring_in_title_gets_no_bonus() {
        let fts = vec![hit("a.md", "Theory of Mind"), hit("b.md", "Unrelated")];

        let results = merge(&fts, &[], "the");
        assert_eq!(results[0].note.path, "a.md");
        // "the" is a substring of "theory" but not a whole word: pure RRF score.
        assert!((results[0].score as f64 - 1.0 / 61.0).abs() < 1e-6);
    }
}
