use crate::features::search::db as search_db;
use crate::features::search::embeddings::{usable_query_vector, EmbeddingService};
use crate::features::search::hnsw_index::VectorIndex;
use crate::features::search::hybrid;
use crate::features::search::model::{HybridSearchHit, ScopeFilter};
use crate::features::search::service::{note_embed_text, SearchQueryInput};
use crate::features::search::vector_db::parse_block_window_key;
use rusqlite::Connection;
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

/// Scores (query, passage) pairs jointly. Higher is more relevant; the scale
/// is the scorer's own (a cross-encoder logit).
pub trait PassageScorer {
    fn score(&self, query: &str, passages: &[&str]) -> Result<Vec<f32>, String>;
}

/// How many fused hits the reranker reorders (ref: DL-007). Scoring cost is
/// linear in this (~34 ms per pair on CPU), and hybrid recall@10 is already
/// ~0.98, so a deeper window buys latency, not recall.
pub const RERANK_CANDIDATES: usize = 20;

/// Fusion depth to request when reranking: a small `limit` still gets a full
/// window to reorder, so a deep candidate can enter it.
pub fn candidate_pool(limit: usize) -> usize {
    limit.max(RERANK_CANDIDATES)
}

/// What a candidate's passage is built from, read while the DB and index
/// locks are held. Building the text (markdown parse, tokenizer split) and
/// scoring happen after they are released.
pub struct PassageSource {
    title: String,
    body: Option<String>,
    window: Option<(String, usize)>,
}

pub struct RerankCandidates {
    hits: Vec<HybridSearchHit>,
    sources: Vec<PassageSource>,
}

impl RerankCandidates {
    /// `split` must cut a section into the windows its block vectors were
    /// embedded from, so a window index resolves to the text it encodes.
    pub fn rerank(
        self,
        query: &str,
        scorer: &dyn PassageScorer,
        split: impl Fn(&str) -> Vec<String>,
        limit: usize,
    ) -> Vec<HybridSearchHit> {
        let passages = passage_texts(&self.sources, split);
        rerank(query, self.hits, &passages, Some(scorer), limit)
    }
}

/// Fuses a rerank-sized candidate pool and reads each candidate's passage
/// source. Callers hold their locks for this step only.
#[allow(clippy::too_many_arguments)]
pub fn rerank_candidates(
    conn: &Connection,
    note_index: &VectorIndex,
    block_index: &VectorIndex,
    model: &EmbeddingService,
    query: &SearchQueryInput,
    limit: usize,
    date_range: Option<(i64, i64)>,
    include_linked: bool,
    scope: Option<&ScopeFilter>,
) -> Result<RerankCandidates, String> {
    let hits = hybrid::hybrid_search(
        conn,
        note_index,
        model,
        query,
        candidate_pool(limit),
        date_range,
        include_linked,
        scope,
    )?;
    // Memoized by `hybrid_search`'s own embed of the same text: no second pass.
    let query_vec = model
        .embed_query(&query.text)
        .ok()
        .and_then(|v| usable_query_vector(v, &query.text));
    let sources = passage_sources(conn, block_index, query_vec.as_deref(), &hits);
    Ok(RerankCandidates { hits, sources })
}

/// One source per hit in the rerank window, in hit order: the note's body and
/// its section window nearest the query, if it has section vectors.
pub fn passage_sources(
    conn: &Connection,
    block_index: &VectorIndex,
    query_vec: Option<&[f32]>,
    hits: &[HybridSearchHit],
) -> Vec<PassageSource> {
    let window = &hits[..hits.len().min(RERANK_CANDIDATES)];
    let keys_by_path = query_vec
        .map(|_| block_keys_by_path(block_index, window))
        .unwrap_or_default();

    window
        .iter()
        .map(|hit| {
            let nearest = query_vec
                .zip(keys_by_path.get(hit.note.path.as_str()))
                .and_then(|(query, keys)| {
                    let (key, _) = block_index
                        .search_within(query, keys.iter().copied(), 1)
                        .into_iter()
                        .next()?;
                    let (_, heading_id, window_index) = parse_block_window_key(&key)?;
                    Some((heading_id.to_string(), window_index))
                });
            PassageSource {
                title: hit.note.title.clone(),
                body: search_db::get_fts_body(conn, &hit.note.path),
                window: nearest,
            }
        })
        .collect()
}

// One pass over the block keys: probing per note with a prefix filter would
// scan every key once per candidate.
fn block_keys_by_path<'a>(
    block_index: &'a VectorIndex,
    hits: &[HybridSearchHit],
) -> HashMap<&'a str, Vec<&'a str>> {
    let candidates: HashSet<&str> = hits.iter().map(|h| h.note.path.as_str()).collect();
    let mut by_path: HashMap<&str, Vec<&str>> = HashMap::new();
    for key in block_index.keys() {
        if let Some((path, _, _)) = parse_block_window_key(key) {
            if candidates.contains(path) {
                by_path.entry(path).or_default().push(key);
            }
        }
    }
    by_path
}

/// The text each source is scored as: its matched section window, exactly as
/// it was embedded, or the whole-note embed text, or the bare title.
pub fn passage_texts(
    sources: &[PassageSource],
    split: impl Fn(&str) -> Vec<String>,
) -> Vec<String> {
    sources
        .iter()
        .map(|source| {
            let body = source.body.as_deref();
            body.zip(source.window.as_ref())
                .and_then(|(body, (heading_id, window_index))| {
                    let section = search_db::embeddable_sections(body, &source.title)
                        .into_iter()
                        .find(|s| s.heading_id == *heading_id)?;
                    split(&section.text).into_iter().nth(*window_index)
                })
                .or_else(|| body.and_then(|b| note_embed_text(&source.title, b)))
                .unwrap_or_else(|| source.title.clone())
        })
        .collect()
}

/// RRF constant for blending the fused order with the reranker's (ref: DL-007).
/// Much smaller than fusion's K=60: over a 20-item window, 60 would flatten
/// both lists into near-ties, so neither signal could move a hit.
const RERANK_BLEND_K: f32 = 10.0;

/// Reorders the top `passages.len()` hits by blending their fused rank with
/// the reranker's rank, then cuts to `limit`. The tail keeps its fused order.
/// Any scorer failure — error, wrong count, non-finite score — returns the
/// fused order unchanged: reranking may only improve on fusion, never take
/// results away.
pub fn rerank(
    query: &str,
    mut hits: Vec<HybridSearchHit>,
    passages: &[String],
    scorer: Option<&dyn PassageScorer>,
    limit: usize,
) -> Vec<HybridSearchHit> {
    let window = passages.len().min(hits.len());
    if let Some(scorer) = scorer.filter(|_| window > 0 && is_rerankable(query)) {
        let texts: Vec<&str> = passages[..window].iter().map(String::as_str).collect();
        match scorer.score(query, &texts) {
            Ok(scores) if scores.len() == window && scores.iter().all(|s| s.is_finite()) => {
                reorder_head(&mut hits, &scores);
            }
            Ok(scores) => log::warn!(
                "reranker returned {} scores for {window} passages (or a non-finite score); keeping fused order",
                scores.len()
            ),
            Err(e) => log::warn!("reranker failed; keeping fused order: {e}"),
        }
    }
    hits.truncate(limit);
    hits
}

fn is_rerankable(query: &str) -> bool {
    query.chars().any(char::is_alphanumeric)
}

// The window's fused scores are reassigned in the new order, so `score` stays
// monotone with list order and on the scale callers fuse it at (RAG adds
// block-search RRF to it and re-sorts).
fn reorder_head(hits: &mut Vec<HybridSearchHit>, scores: &[f32]) {
    let tail = hits.split_off(scores.len());
    let mut window_scores: Vec<f32> = hits.iter().map(|h| h.score).collect();
    window_scores.sort_by(|a, b| b.total_cmp(a));
    let mut blended: Vec<(f32, HybridSearchHit)> = blend_ranks(scores)
        .into_iter()
        .zip(hits.drain(..))
        .collect();
    blended.sort_by(|(a, x), (b, y)| {
        b.partial_cmp(a)
            .unwrap_or(Ordering::Equal)
            .then_with(|| x.note.path.cmp(&y.note.path))
    });
    hits.extend(
        blended
            .into_iter()
            .zip(window_scores)
            .map(|((_, mut hit), score)| {
                hit.score = score;
                hit
            }),
    );
    hits.extend(tail);
}

// RRF over two lists of the same hits: their fused order (the input order)
// and their order by reranker score. Equal reranker scores keep fused order.
fn blend_ranks(scores: &[f32]) -> Vec<f32> {
    let mut by_score: Vec<usize> = (0..scores.len()).collect();
    by_score.sort_by(|&a, &b| scores[b].partial_cmp(&scores[a]).unwrap_or(Ordering::Equal));
    let mut rerank_rank = vec![0usize; scores.len()];
    for (rank, &i) in by_score.iter().enumerate() {
        rerank_rank[i] = rank;
    }
    let rrf = |rank: usize| 1.0 / (RERANK_BLEND_K + rank as f32 + 1.0);
    (0..scores.len())
        .map(|fused_rank| rrf(fused_rank) + rrf(rerank_rank[fused_rank]))
        .collect()
}
