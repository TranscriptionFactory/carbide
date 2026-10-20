use crate::features::search::cross_encoder::CrossEncoder;
use crate::features::search::db::{embeddable_sections, open_search_db_at_path, upsert_note};
use crate::features::search::hnsw_index::VectorIndex;
use crate::features::search::model::{HitSource, HybridSearchHit, IndexNoteMeta};
use crate::features::search::rerank::{
    candidate_pool, passage_sources, passage_texts, rerank, PassageScorer, RERANK_CANDIDATES,
};
use crate::features::search::service::rerank_enabled;
use crate::features::search::vector_db::block_window_key;
use crate::features::settings::service::SettingsStore;
use crate::tests::retrieval_eval::model_cache_dir;
use rusqlite::Connection;
use serde_json::json;
use std::cell::{Cell, RefCell};
use tempfile::TempDir;

fn meta(path: &str, title: &str) -> IndexNoteMeta {
    IndexNoteMeta {
        id: path.into(),
        path: path.into(),
        title: title.into(),
        name: path.trim_end_matches(".md").into(),
        mtime_ms: 1_000,
        ctime_ms: 1_000,
        size_bytes: 10,
        blurb: String::new(),
        file_type: None,
        source: None,
    }
}

fn hit(path: &str, rrf: f32) -> HybridSearchHit {
    titled_hit(path, path.trim_end_matches(".md"), rrf)
}

fn titled_hit(path: &str, title: &str, rrf: f32) -> HybridSearchHit {
    HybridSearchHit {
        note: meta(path, title),
        score: rrf,
        snippet: None,
        snippet_page: None,
        source: HitSource::Both,
    }
}

fn rrf_hits(n: usize) -> Vec<HybridSearchHit> {
    (0..n)
        .map(|i| hit(&format!("n{i:02}.md"), 1.0 / (61.0 + i as f32)))
        .collect()
}

fn paths(hits: &[HybridSearchHit]) -> Vec<String> {
    hits.iter().map(|h| h.note.path.clone()).collect()
}

fn scores(hits: &[HybridSearchHit]) -> Vec<f32> {
    hits.iter().map(|h| h.score).collect()
}

fn assert_scores_follow_order(hits: &[HybridSearchHit]) {
    assert!(
        hits.windows(2).all(|w| w[0].score >= w[1].score),
        "scores must stay monotone with list order: {:?}",
        scores(hits)
    );
}

fn passages_for(hits: &[HybridSearchHit]) -> Vec<String> {
    hits.iter()
        .take(RERANK_CANDIDATES)
        .map(|h| format!("passage of {}", h.note.path))
        .collect()
}

/// Scores a passage by the share of query terms it contains — enough to tell
/// an answering section from a generic one without loading a model.
struct TermOverlapScorer;

impl PassageScorer for TermOverlapScorer {
    fn score(&self, query: &str, passages: &[&str]) -> Result<Vec<f32>, String> {
        let terms: Vec<String> = query.split_whitespace().map(str::to_lowercase).collect();
        Ok(passages
            .iter()
            .map(|p| {
                let p = p.to_lowercase();
                terms.iter().filter(|t| p.contains(t.as_str())).count() as f32 / terms.len() as f32
            })
            .collect())
    }
}

struct FixedScorer(Vec<f32>);

impl PassageScorer for FixedScorer {
    fn score(&self, _query: &str, passages: &[&str]) -> Result<Vec<f32>, String> {
        Ok(self.0.iter().copied().take(passages.len()).collect())
    }
}

struct FailingScorer;

impl PassageScorer for FailingScorer {
    fn score(&self, _query: &str, _passages: &[&str]) -> Result<Vec<f32>, String> {
        Err("reranker unavailable".into())
    }
}

#[derive(Default)]
struct RecordingScorer {
    calls: Cell<usize>,
    seen: RefCell<Vec<String>>,
}

impl PassageScorer for RecordingScorer {
    fn score(&self, _query: &str, passages: &[&str]) -> Result<Vec<f32>, String> {
        self.calls.set(self.calls.get() + 1);
        self.seen
            .borrow_mut()
            .extend(passages.iter().map(|p| p.to_string()));
        Ok(passages.iter().map(|_| 0.0).collect())
    }
}

fn reversing_scores(n: usize) -> FixedScorer {
    FixedScorer((0..n).map(|i| i as f32).collect())
}

fn promote_last(n: usize) -> FixedScorer {
    FixedScorer(
        (0..n)
            .map(|i| if i == n - 1 { 10.0 } else { 0.0 })
            .collect(),
    )
}

#[test]
fn candidate_pool_widens_small_limits_to_the_rerank_window() {
    assert_eq!(candidate_pool(5), RERANK_CANDIDATES);
    assert_eq!(candidate_pool(RERANK_CANDIDATES + 7), RERANK_CANDIDATES + 7);
}

// The reported failure: a long multi-topic note sits mid-rank in both fused
// lists and outranks a short note whose one section answers the query. Blending
// keeps fusion's say, so the answer must be close behind in fused order and the
// hub must score last for the reranker to swap them.
#[test]
fn hub_note_reranks_below_the_short_note_whose_section_answers_the_query() {
    let hits = vec![
        hit("hub.md", 0.033),
        hit("procure.md", 0.032),
        hit("answer.md", 0.031),
        hit("lamp.md", 0.030),
        hit("vendor.md", 0.029),
    ];
    let passages = vec![
        "Weekly digest: meetings, grant deadlines, reading list, misc lab notes".to_string(),
        "Ordering a spectrometer through the procurement portal".to_string(),
        "To calibrate the spectrometer, run the reference lamp scan first".to_string(),
        "Replacing the spectrometer lamp".to_string(),
        "Spectrometer vendor contacts".to_string(),
    ];

    let ranked = rerank(
        "calibrate spectrometer",
        hits,
        &passages,
        Some(&TermOverlapScorer),
        10,
    );

    assert_eq!(ranked[0].note.path, "answer.md");
    let hub = ranked.iter().position(|h| h.note.path == "hub.md").unwrap();
    assert!(hub > 0, "the hub must lose the top spot");
    assert_scores_follow_order(&ranked);
}

#[test]
fn rerank_reorders_only_the_top_n_and_keeps_the_tail_in_rrf_order() {
    let hits = rrf_hits(RERANK_CANDIDATES + 5);
    let passages = passages_for(&hits);
    let before = paths(&hits);
    let promoted = before[RERANK_CANDIDATES - 1].clone();

    let ranked = rerank(
        "query",
        hits,
        &passages,
        Some(&promote_last(RERANK_CANDIDATES)),
        RERANK_CANDIDATES + 5,
    );
    let after = paths(&ranked);

    let promoted_at = after.iter().position(|p| *p == promoted).unwrap();
    assert!(
        promoted_at < RERANK_CANDIDATES - 1,
        "the reranker's favourite moves up"
    );
    assert_eq!(after[RERANK_CANDIDATES..], before[RERANK_CANDIDATES..]);
    assert_scores_follow_order(&ranked);
}

#[test]
fn rerank_never_adds_or_drops_candidates_before_the_limit_cut() {
    let hits = rrf_hits(RERANK_CANDIDATES);
    let passages = passages_for(&hits);
    let mut before = paths(&hits);

    let ranked = rerank(
        "query",
        hits,
        &passages,
        Some(&reversing_scores(RERANK_CANDIDATES)),
        RERANK_CANDIDATES,
    );
    let mut after = paths(&ranked);

    before.sort();
    after.sort();
    assert_eq!(before, after);
}

// RAG fuses `score` with block-search RRF and re-sorts by it, so a reordered
// list whose scores still follow the old order is silently undone downstream.
#[test]
fn reranked_window_reuses_its_fused_scores_in_the_new_order() {
    let hits = rrf_hits(RERANK_CANDIDATES);
    let passages = passages_for(&hits);
    let mut window_scores = scores(&hits);

    let ranked = rerank(
        "query",
        hits,
        &passages,
        Some(&promote_last(RERANK_CANDIDATES)),
        RERANK_CANDIDATES,
    );

    assert_scores_follow_order(&ranked);
    let mut after = scores(&ranked);
    window_scores.sort_by(f32::total_cmp);
    after.sort_by(f32::total_cmp);
    assert_eq!(after, window_scores, "same scale, same values, new owners");
}

#[test]
fn rerank_truncates_to_the_requested_limit_after_reordering() {
    let hits = rrf_hits(RERANK_CANDIDATES);
    let passages = passages_for(&hits);
    let deepest = hits[RERANK_CANDIDATES - 1].note.path.clone();

    let ranked = rerank(
        "query",
        hits,
        &passages,
        Some(&promote_last(RERANK_CANDIDATES)),
        10,
    );

    assert_eq!(ranked.len(), 10);
    assert!(
        ranked.iter().any(|h| h.note.path == deepest),
        "a candidate fused below the limit can enter it"
    );
}

#[test]
fn no_scorer_returns_the_rrf_order_unchanged() {
    let hits = rrf_hits(RERANK_CANDIDATES + 5);
    let passages = passages_for(&hits);
    let before = paths(&hits);

    let scores_before = scores(&hits);
    let ranked = rerank("query", hits, &passages, None, RERANK_CANDIDATES + 5);

    assert_eq!(paths(&ranked), before);
    assert_eq!(scores(&ranked), scores_before);
}

#[test]
fn scorer_error_returns_the_rrf_order_unchanged() {
    let hits = rrf_hits(RERANK_CANDIDATES);
    let passages = passages_for(&hits);
    let before = paths(&hits);

    let scores_before = scores(&hits);
    let ranked = rerank(
        "query",
        hits,
        &passages,
        Some(&FailingScorer),
        RERANK_CANDIDATES,
    );

    assert_eq!(paths(&ranked), before);
    assert_eq!(scores(&ranked), scores_before);
}

#[test]
fn scorer_returning_the_wrong_count_returns_the_rrf_order_unchanged() {
    let hits = rrf_hits(RERANK_CANDIDATES);
    let passages = passages_for(&hits);
    let before = paths(&hits);

    let ranked = rerank(
        "query",
        hits,
        &passages,
        Some(&FixedScorer(vec![5.0, 1.0])),
        RERANK_CANDIDATES,
    );

    assert_eq!(paths(&ranked), before);
}

#[test]
fn scorer_returning_non_finite_scores_returns_the_rrf_order_unchanged() {
    let hits = rrf_hits(3);
    let passages = passages_for(&hits);
    let before = paths(&hits);

    let ranked = rerank(
        "query",
        hits,
        &passages,
        Some(&FixedScorer(vec![f32::NAN, 9.0, 1.0])),
        3,
    );

    assert_eq!(paths(&ranked), before);
}

#[test]
fn empty_or_unusable_query_never_calls_the_scorer() {
    for query in ["", "   ", "?! --"] {
        let hits = rrf_hits(5);
        let passages = passages_for(&hits);
        let before = paths(&hits);
        let scorer = RecordingScorer::default();

        let ranked = rerank(query, hits, &passages, Some(&scorer), 5);

        assert_eq!(scorer.calls.get(), 0, "query {query:?} must not be scored");
        assert_eq!(paths(&ranked), before);
    }
}

// Scope, date and include_linked are applied by fusion; rerank must see the
// filtered candidates and nothing else.
#[test]
fn scorer_sees_exactly_the_filtered_candidates_and_nothing_else() {
    let hits = rrf_hits(RERANK_CANDIDATES + 3);
    let passages = passages_for(&hits);
    let scorer = RecordingScorer::default();

    let ranked = rerank("query", hits.clone(), &passages, Some(&scorer), 50);

    assert_eq!(scorer.calls.get(), 1);
    assert_eq!(*scorer.seen.borrow(), passages);
    let allowed = paths(&hits);
    assert!(ranked.iter().all(|h| allowed.contains(&h.note.path)));
}

#[test]
fn equal_reranker_scores_keep_the_fused_order() {
    let hits = vec![hit("c.md", 0.03), hit("a.md", 0.02), hit("b.md", 0.01)];
    let passages = passages_for(&hits);
    let scorer = FixedScorer(vec![1.0, 1.0, 1.0]);

    let first = rerank("query", hits.clone(), &passages, Some(&scorer), 3);
    let second = rerank("query", hits, &passages, Some(&scorer), 3);

    assert_eq!(paths(&first), vec!["c.md", "a.md", "b.md"]);
    assert_eq!(paths(&first), paths(&second));
}

// Fused #1 that the reranker ranks #2, against fused #2 it ranks #1: the
// blended scores are exactly equal, so path order decides.
#[test]
fn equal_blended_scores_break_ties_by_path() {
    let hits = vec![hit("c.md", 0.03), hit("a.md", 0.02)];
    let passages = passages_for(&hits);

    let ranked = rerank(
        "query",
        hits,
        &passages,
        Some(&FixedScorer(vec![0.0, 1.0])),
        2,
    );

    assert_eq!(paths(&ranked), vec!["a.md", "c.md"]);
}

const HUB_MARKDOWN: &str = "# Digest\n\n\
## Meetings\n\nWeekly sync covered grant deadlines, travel plans, the reading list for the term, \
the seminar rota, the shared calendar and who orders coffee next.\n\n\
## Spectrometer\n\nTo calibrate the spectrometer, run the reference lamp scan first, record the offsets \
for each channel, then repeat the dark frame before any sample is measured.\n";

fn indexed_conn(tmp: &TempDir) -> Connection {
    let conn = open_search_db_at_path(&tmp.path().join("rerank.db")).expect("db open");
    upsert_note(&conn, &meta("hub.md", "Digest"), HUB_MARKDOWN).expect("index hub");
    upsert_note(&conn, &meta("short.md", "Tiny"), "just a short line").expect("index short");
    conn
}

fn heading_id(markdown: &str, title: &str, needle: &str) -> String {
    embeddable_sections(markdown, title)
        .into_iter()
        .find(|s| s.text.contains(needle))
        .unwrap_or_else(|| panic!("no section contains {needle:?}"))
        .heading_id
}

fn whole(text: &str) -> Vec<String> {
    vec![text.to_string()]
}

fn select_passages(
    conn: &Connection,
    block_index: &VectorIndex,
    query_vec: Option<&[f32]>,
    hits: &[HybridSearchHit],
    split: impl Fn(&str) -> Vec<String>,
) -> Vec<String> {
    passage_texts(&passage_sources(conn, block_index, query_vec, hits), split)
}

fn section_text(markdown: &str, title: &str, needle: &str) -> String {
    embeddable_sections(markdown, title)
        .into_iter()
        .find(|s| s.text.contains(needle))
        .unwrap_or_else(|| panic!("no section contains {needle:?}"))
        .text
}

#[test]
fn passage_is_the_section_nearest_the_query_exactly_as_it_was_embedded() {
    let tmp = TempDir::new().expect("tmp");
    let conn = indexed_conn(&tmp);
    let meetings = heading_id(HUB_MARKDOWN, "Digest", "Weekly sync");
    let spectro = heading_id(HUB_MARKDOWN, "Digest", "reference lamp");
    let mut block_index = VectorIndex::new(2);
    block_index.insert(&block_window_key("hub.md", &meetings, 0), vec![1.0, 0.0]);
    block_index.insert(&block_window_key("hub.md", &spectro, 0), vec![0.0, 1.0]);

    let passages = select_passages(
        &conn,
        &block_index,
        Some(&[0.1, 0.99]),
        &[titled_hit("hub.md", "Digest", 0.03)],
        whole,
    );

    assert_eq!(
        passages,
        vec![section_text(HUB_MARKDOWN, "Digest", "reference lamp")]
    );
}

#[test]
fn passage_uses_the_matched_window_of_a_split_section() {
    let tmp = TempDir::new().expect("tmp");
    let conn = indexed_conn(&tmp);
    let spectro = heading_id(HUB_MARKDOWN, "Digest", "reference lamp");
    let mut block_index = VectorIndex::new(2);
    block_index.insert(&block_window_key("hub.md", &spectro, 0), vec![1.0, 0.0]);
    block_index.insert(&block_window_key("hub.md", &spectro, 1), vec![0.0, 1.0]);

    let passages = select_passages(
        &conn,
        &block_index,
        Some(&[0.0, 1.0]),
        &[titled_hit("hub.md", "Digest", 0.03)],
        |text: &str| {
            vec![
                format!("first window of {}", text.len()),
                "second window".to_string(),
            ]
        },
    );

    assert_eq!(passages, vec!["second window".to_string()]);
}

#[test]
fn note_without_section_vectors_falls_back_to_title_and_body() {
    let tmp = TempDir::new().expect("tmp");
    let conn = indexed_conn(&tmp);
    let block_index = VectorIndex::new(2);

    let passages = select_passages(
        &conn,
        &block_index,
        Some(&[0.0, 1.0]),
        &[titled_hit("short.md", "Tiny", 0.03)],
        whole,
    );

    assert_eq!(passages, vec!["Tiny\n\njust a short line".to_string()]);
}

#[test]
fn unusable_query_vector_falls_back_to_title_and_body() {
    let tmp = TempDir::new().expect("tmp");
    let conn = indexed_conn(&tmp);
    let spectro = heading_id(HUB_MARKDOWN, "Digest", "reference lamp");
    let mut block_index = VectorIndex::new(2);
    block_index.insert(&block_window_key("hub.md", &spectro, 0), vec![0.0, 1.0]);

    let passages = select_passages(
        &conn,
        &block_index,
        None,
        &[titled_hit("hub.md", "Digest", 0.03)],
        whole,
    );

    assert!(
        passages[0].starts_with("Digest\n\n# Digest"),
        "got {:?}",
        passages[0]
    );
}

#[test]
fn passages_cover_at_most_the_rerank_window_in_hit_order() {
    let tmp = TempDir::new().expect("tmp");
    let conn = indexed_conn(&tmp);
    let block_index = VectorIndex::new(2);
    let mut hits = vec![titled_hit("short.md", "Tiny", 0.05)];
    hits.extend(rrf_hits(RERANK_CANDIDATES + 4));

    let passages = select_passages(&conn, &block_index, Some(&[0.0, 1.0]), &hits, whole);

    assert_eq!(passages.len(), RERANK_CANDIDATES);
    assert_eq!(passages[0], "Tiny\n\njust a short line");
}

#[test]
fn rerank_is_disabled_by_default() {
    assert!(!rerank_enabled(&SettingsStore::default()));
}

#[test]
fn rerank_setting_reads_the_global_store_value() {
    let mut store = SettingsStore::default();
    store
        .settings
        .insert("search_rerank_enabled".to_string(), json!(true));
    assert!(rerank_enabled(&store));
}

// Downloads the model on first run.
#[test]
#[ignore]
fn real_cross_encoder_scores_the_answering_passage_above_the_hub() {
    let encoder = CrossEncoder::new(model_cache_dir()).expect("load reranker");
    let passages = [
        "Digest › Meetings\n\nWeekly sync covered grant deadlines, travel plans, the reading list and the seminar rota.",
        "Lab SOP › Spectrometer\n\nTo calibrate the spectrometer, run the reference lamp scan first and record the offsets.",
    ];

    let scores = encoder
        .score("how do I calibrate the spectrometer", &passages)
        .expect("score");

    assert!(scores[1] > 0.0, "answer logit {}", scores[1]);
    assert!(scores[0] < 0.0, "hub logit {}", scores[0]);
}
