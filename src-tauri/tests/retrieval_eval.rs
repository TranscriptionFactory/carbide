//! Retrieval quality eval harness: recall@1/3/5/10 and MRR, broken down by
//! query type, across the fts/vector/hybrid/blocks search modes. The metric
//! functions are pure and covered by ordinary tests below; the eval itself
//! needs a downloaded encoder, so it is a single `#[ignore]` test.
//!
//! `cargo test --lib retrieval_eval -- --ignored --nocapture`
//!
//! `CARBIDE_EVAL_VAULT` / `CARBIDE_EVAL_QUERIES` override the fixture paths
//! (for the private real-vault set). `CARBIDE_EVAL_OUT` writes a JSON report.
//! `CARBIDE_MODEL_CACHE` overrides the model cache dir, following the
//! convention in `embedding_device_probe.rs`.

use crate::features::search::db as search_db;
use crate::features::search::embedding_model::{self, DEFAULT_MODEL_SHORT_ID};
use crate::features::search::embeddings::{usable_query_vector, EmbeddingService};
use crate::features::search::hnsw_index::{SharedVectorIndex, VectorIndex};
use crate::features::search::hybrid;
use crate::features::search::model::{ScopeFilter, SearchScope};
use crate::features::search::service::{apply_note_embedding_on_save, SaveEncoder, SearchQueryInput};
use crate::features::search::vector_db;
use rusqlite::Connection;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, RwLock};
use tempfile::TempDir;

const RECALL_CUTOFFS: [usize; 4] = [1, 3, 5, 10];
const TOP_N: usize = 10;
const MODES: [&str; 4] = ["fts", "vector", "hybrid", "blocks"];

#[derive(Debug, Clone)]
struct ExpectedHit {
    path: String,
    heading_id: Option<String>,
}

/// A note-level hit (`heading_id: None`) matches on path alone. A block-level
/// hit matches on path, and on heading too whenever the expectation names one
/// — an expectation with no heading is a path-only assertion even against a
/// block hit.
fn expected_matches(expected: &[ExpectedHit], path: &str, heading_id: Option<&str>) -> bool {
    expected.iter().any(|e| {
        e.path == path
            && match heading_id {
                None => true,
                Some(h) => e.heading_id.as_deref().map_or(true, |eh| eh == h),
            }
    })
}

fn hit_rank(hits: &[(String, Option<String>)], expected: &[ExpectedHit]) -> Option<usize> {
    hits.iter()
        .position(|(path, heading_id)| expected_matches(expected, path, heading_id.as_deref()))
        .map(|i| i + 1)
}

fn recall_at_k(hits: &[(String, Option<String>)], expected: &[ExpectedHit], k: usize) -> f64 {
    match hit_rank(hits, expected) {
        Some(rank) if rank <= k => 1.0,
        _ => 0.0,
    }
}

fn reciprocal_rank(hits: &[(String, Option<String>)], expected: &[ExpectedHit]) -> f64 {
    hit_rank(hits, expected).map_or(0.0, |rank| 1.0 / rank as f64)
}

fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<f64>() / values.len() as f64
    }
}

#[derive(Default)]
struct MetricAcc {
    recall: HashMap<usize, Vec<f64>>,
    rr: Vec<f64>,
}

impl MetricAcc {
    fn record(&mut self, hits: &[(String, Option<String>)], expected: &[ExpectedHit]) {
        for k in RECALL_CUTOFFS {
            self.recall.entry(k).or_default().push(recall_at_k(hits, expected, k));
        }
        self.rr.push(reciprocal_rank(hits, expected));
    }

    fn line(&self) -> String {
        let recalls: Vec<String> = RECALL_CUTOFFS
            .iter()
            .map(|k| format!("r@{k}={:.2}", mean(self.recall.get(k).map_or(&[][..], |v| v))))
            .collect();
        format!("{} mrr={:.3} n={}", recalls.join(" "), mean(&self.rr), self.rr.len())
    }

    fn as_json(&self) -> serde_json::Value {
        let mut m = serde_json::Map::new();
        for k in RECALL_CUTOFFS {
            let v = mean(self.recall.get(&k).map_or(&[][..], |v| v));
            m.insert(format!("recall_at_{k}"), serde_json::json!(v));
        }
        m.insert("mrr".to_string(), serde_json::json!(mean(&self.rr)));
        m.insert("n".to_string(), serde_json::json!(self.rr.len()));
        serde_json::Value::Object(m)
    }
}

#[cfg(test)]
mod metrics_tests {
    use super::*;

    fn note_hit(path: &str) -> (String, Option<String>) {
        (path.to_string(), None)
    }

    fn block_hit(path: &str, heading_id: &str) -> (String, Option<String>) {
        (path.to_string(), Some(heading_id.to_string()))
    }

    fn expect_path(path: &str) -> Vec<ExpectedHit> {
        vec![ExpectedHit { path: path.to_string(), heading_id: None }]
    }

    fn expect_block(path: &str, heading_id: &str) -> Vec<ExpectedHit> {
        vec![ExpectedHit { path: path.to_string(), heading_id: Some(heading_id.to_string()) }]
    }

    #[test]
    fn recall_at_k_hits_within_cutoff_but_not_before() {
        let hits = vec![note_hit("a.md"), note_hit("b.md"), note_hit("target.md")];
        let expected = expect_path("target.md");
        assert_eq!(recall_at_k(&hits, &expected, 1), 0.0);
        assert_eq!(recall_at_k(&hits, &expected, 2), 0.0);
        assert_eq!(recall_at_k(&hits, &expected, 3), 1.0);
    }

    #[test]
    fn recall_at_k_is_zero_when_absent() {
        let hits = vec![note_hit("a.md"), note_hit("b.md")];
        assert_eq!(recall_at_k(&hits, &expect_path("missing.md"), 10), 0.0);
    }

    #[test]
    fn reciprocal_rank_matches_hand_computed_value() {
        let hits = vec![note_hit("a.md"), note_hit("target.md"), note_hit("b.md")];
        assert_eq!(reciprocal_rank(&hits, &expect_path("target.md")), 0.5);
    }

    #[test]
    fn reciprocal_rank_is_zero_when_absent() {
        let hits = vec![note_hit("a.md")];
        assert_eq!(reciprocal_rank(&hits, &expect_path("missing.md")), 0.0);
    }

    #[test]
    fn block_hit_requires_the_named_heading() {
        let expected = expect_block("n.md", "h-2-a-0");
        let right = vec![block_hit("n.md", "h-2-a-0")];
        let wrong = vec![block_hit("n.md", "h-2-b-0")];
        assert_eq!(reciprocal_rank(&right, &expected), 1.0);
        assert_eq!(reciprocal_rank(&wrong, &expected), 0.0);
    }

    #[test]
    fn note_level_hit_matches_regardless_of_expected_heading() {
        let expected = expect_block("n.md", "h-2-a-0");
        let hits = vec![note_hit("n.md")];
        assert_eq!(reciprocal_rank(&hits, &expected), 1.0);
    }

    #[test]
    fn block_hit_matches_a_path_only_expectation() {
        let hits = vec![block_hit("n.md", "h-2-anything-0")];
        assert_eq!(reciprocal_rank(&hits, &expect_path("n.md")), 1.0);
    }

    #[test]
    fn mean_of_empty_is_zero() {
        assert_eq!(mean(&[]), 0.0);
    }
}

#[derive(Deserialize)]
struct FixtureQueries {
    queries: Vec<FixtureQuery>,
}

#[derive(Deserialize)]
struct FixtureQuery {
    query: String,
    #[serde(rename = "type")]
    kind: String,
    expected: Vec<FixtureExpected>,
    k: usize,
    date_range: Option<FixtureDateRange>,
    scope: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct FixtureExpected {
    path: String,
    heading_id: Option<String>,
}

#[derive(Deserialize)]
struct FixtureDateRange {
    from: String,
    to: String,
}

/// Days-from-civil (Howard Hinnant's algorithm), used only to turn the
/// fixtures' fixed `YYYY-MM-DDTHH:MM:SSZ` shape into epoch ms without pulling
/// in a date-time crate for one narrow, test-only format.
fn parse_rfc3339_utc_ms(s: &str) -> i64 {
    let s = s.strip_suffix('Z').expect("fixture timestamps are UTC");
    let (date, time) = s.split_once('T').expect("fixture timestamps carry a time");
    let mut date_parts = date.split('-');
    let year: i64 = date_parts.next().unwrap().parse().unwrap();
    let month: i64 = date_parts.next().unwrap().parse().unwrap();
    let day: i64 = date_parts.next().unwrap().parse().unwrap();
    let mut time_parts = time.split(':');
    let hour: i64 = time_parts.next().unwrap().parse().unwrap();
    let minute: i64 = time_parts.next().unwrap().parse().unwrap();
    let second: i64 = time_parts.next().unwrap().parse().unwrap();

    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;

    (days * 86_400 + hour * 3600 + minute * 60 + second) * 1000
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let dst_path = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &dst_path)?;
        } else {
            std::fs::copy(entry.path(), &dst_path)?;
        }
    }
    Ok(())
}

fn apply_mtimes(vault_root: &Path, mtimes_path: &Path) {
    let raw = std::fs::read_to_string(mtimes_path).expect("read mtimes fixture");
    let mtimes: HashMap<String, String> =
        serde_json::from_str(&raw).expect("parse mtimes fixture");
    for (rel, iso) in mtimes {
        let ft = filetime::FileTime::from_unix_time(parse_rfc3339_utc_ms(&iso) / 1000, 0);
        filetime::set_file_mtime(vault_root.join(&rel), ft)
            .unwrap_or_else(|e| panic!("set mtime for {rel}: {e}"));
    }
}

/// Mirrors RetrievalService.resolve_scope_filter (retrieval_service.ts):
/// notes/tags resolve to explicit paths and are ANDed together; folders
/// become prefixes, gating the resolved path set when one exists or standing
/// alone as `prefixes` otherwise. `bases` has no eval-harness resolver, so its
/// presence reports the query unsupported rather than silently unscoping it.
fn parse_scope(conn: &Connection, scope: &serde_json::Value) -> Option<ScopeFilter> {
    if scope.get("bases").and_then(|v| v.as_array()).is_some_and(|a| !a.is_empty()) {
        return None;
    }

    let as_strings = |key: &str| -> Vec<String> {
        scope
            .get(key)
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
            .unwrap_or_default()
    };
    let notes = as_strings("notes");
    let tags = as_strings("tags");
    let folders = as_strings("folders");

    let mut candidate: Option<HashSet<String>> =
        if notes.is_empty() { None } else { Some(notes.into_iter().collect()) };

    if !tags.is_empty() {
        let mut resolved = HashSet::new();
        for tag in &tags {
            if let Ok(paths) = search_db::get_notes_for_tag(conn, tag) {
                resolved.extend(paths);
            }
        }
        candidate = Some(match candidate {
            Some(existing) => existing.intersection(&resolved).cloned().collect(),
            None => resolved,
        });
    }

    let prefixes: Vec<String> = folders.iter().map(|f| format!("{f}/")).collect();

    Some(if let Some(candidate) = candidate {
        let paths = if prefixes.is_empty() {
            candidate.into_iter().collect()
        } else {
            candidate
                .into_iter()
                .filter(|p| prefixes.iter().any(|pre| p.starts_with(pre.as_str())))
                .collect()
        };
        ScopeFilter { paths, prefixes: vec![] }
    } else {
        ScopeFilter { paths: vec![], prefixes }
    })
}

fn model_cache_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("CARBIDE_MODEL_CACHE") {
        return PathBuf::from(dir);
    }
    let home = PathBuf::from(std::env::var("HOME").expect("HOME"));
    if cfg!(target_os = "macos") {
        home.join("Library/Caches/com.carbide.desktop/models")
    } else {
        home.join(".cache/com.carbide.desktop/models")
    }
}

fn run_fts(
    conn: &Connection,
    query: &str,
    limit: usize,
    date_range: Option<(i64, i64)>,
    scope: Option<&ScopeFilter>,
) -> Vec<(String, Option<String>)> {
    search_db::search(conn, query, SearchScope::All, limit, date_range, true, scope)
        .unwrap_or_default()
        .into_iter()
        .map(|hit| (hit.note.path, None))
        .collect()
}

/// Reuses `hybrid::vector_leg` (the same date/scope-aware exact-scan path
/// `hybrid_search` uses) rather than re-implementing over-fetch-then-filter
/// here.
fn run_vector(
    conn: &Connection,
    note_index: &SharedVectorIndex,
    model: &EmbeddingService,
    query: &str,
    limit: usize,
    date_range: Option<(i64, i64)>,
    scope: Option<&ScopeFilter>,
) -> Vec<(String, Option<String>)> {
    let Ok(query_vec) = model.embed_query(query) else {
        return Vec::new();
    };
    let over_fetch = limit * 3;
    let vector_fetch = if date_range.is_some() { (limit * 20).max(500) } else { over_fetch };
    let allowed = hybrid::resolve_allowed_paths(conn, date_range, scope).unwrap_or(None);

    let idx = note_index.read().expect("index lock");
    let hits = hybrid::vector_leg(
        &idx,
        query_vec,
        query,
        vector_fetch,
        over_fetch,
        limit,
        allowed.as_ref(),
        true,
    );
    hits.into_iter().take(limit).map(|(path, _)| (path, None)).collect()
}

fn run_hybrid(
    conn: &Connection,
    note_index: &SharedVectorIndex,
    model: &EmbeddingService,
    query: &str,
    limit: usize,
    date_range: Option<(i64, i64)>,
    scope: Option<&ScopeFilter>,
) -> Vec<(String, Option<String>)> {
    let query_input = SearchQueryInput {
        raw: query.to_string(),
        text: query.to_string(),
        scope: SearchScope::All,
    };
    let idx = note_index.read().expect("index lock");
    hybrid::hybrid_search(conn, &idx, model, &query_input, limit, date_range, true, scope)
        .unwrap_or_default()
        .into_iter()
        .map(|hit| (hit.note.path, None))
        .collect()
}

/// Mirrors `search_blocks_inner` (service.rs:4378-4448) minus the `AppHandle`
/// plumbing: the harness reaches the DB and the block index directly. A small
/// enough allowed set is scanned exactly, same threshold as the vector leg;
/// the scope predicate is re-checked per hit on the over-fetch fallback path.
fn run_blocks(
    conn: &Connection,
    block_index: &SharedVectorIndex,
    model: &EmbeddingService,
    query: &str,
    limit: usize,
    date_range: Option<(i64, i64)>,
    scope: Option<&ScopeFilter>,
) -> Vec<(String, Option<String>)> {
    let Ok(query_vec) = model.embed_query(query) else {
        return Vec::new();
    };
    let Some(query_vec) = usable_query_vector(query_vec, query) else {
        return Vec::new();
    };
    let fetch = if date_range.is_some() { (limit * 20).max(500) } else { limit * 3 };
    let allowed = hybrid::resolve_allowed_paths(conn, date_range, scope).unwrap_or(None);

    let idx = block_index.read().expect("index lock");
    let raw = match &allowed {
        Some(allowed) if allowed.len() <= hybrid::FILTERED_EXACT_MAX => {
            let keys = idx
                .keys()
                .filter(|k| k.split_once('\0').is_some_and(|(path, _)| allowed.contains(path)));
            idx.search_within(&query_vec, keys, fetch)
        }
        _ => idx.search(&query_vec, fetch),
    };
    drop(idx);

    let mut results = Vec::with_capacity(limit);
    for (key, _distance) in &raw {
        if results.len() >= limit {
            break;
        }
        let Some((path, heading_id)) = key.split_once('\0') else {
            continue;
        };
        if scope.is_some_and(|sf| sf.is_active() && !sf.matches(path)) {
            continue;
        }
        if search_db::get_section(conn, path, heading_id).ok().flatten().is_none() {
            continue;
        }
        let Some(note) = search_db::get_note_meta(conn, path).ok().flatten() else {
            continue;
        };
        if let Some((start_ms, end_ms)) = date_range {
            if note.mtime_ms < start_ms || note.mtime_ms >= end_ms {
                continue;
            }
        }
        results.push((path.to_string(), Some(heading_id.to_string())));
    }
    results
}

#[test]
#[ignore = "needs the downloaded encoder weights; run with --ignored --nocapture"]
fn retrieval_eval_report() {
    let fixture_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/retrieval_eval");
    let vault_src = std::env::var("CARBIDE_EVAL_VAULT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| fixture_dir.join("vault"));
    let queries_path = std::env::var("CARBIDE_EVAL_QUERIES")
        .map(PathBuf::from)
        .unwrap_or_else(|_| fixture_dir.join("queries.json"));
    let mtimes_path = fixture_dir.join("mtimes.json");

    let vault_tmp = TempDir::new().expect("vault temp dir");
    copy_dir_all(&vault_src, vault_tmp.path()).expect("copy vault fixture");
    if mtimes_path.exists() {
        apply_mtimes(vault_tmp.path(), &mtimes_path);
    }

    let db_tmp = TempDir::new().expect("db temp dir");
    let conn = search_db::open_search_db_at_path(&db_tmp.path().join("eval.db")).expect("open db");
    vector_db::init_vector_schema(&conn).expect("vector schema");

    let cancel = AtomicBool::new(false);
    search_db::rebuild_index(
        None,
        "eval-vault",
        &conn,
        vault_tmp.path(),
        &cancel,
        &|_, _| {},
        &mut || {},
    )
    .expect("rebuild index");

    let model =
        EmbeddingService::new(model_cache_dir(), DEFAULT_MODEL_SHORT_ID).expect("load embedding model");
    let dims = embedding_model::lookup(DEFAULT_MODEL_SHORT_ID).dims;
    let note_index: SharedVectorIndex = Arc::new(RwLock::new(VectorIndex::new(dims)));
    let block_index: SharedVectorIndex = Arc::new(RwLock::new(VectorIndex::new(dims)));

    let files =
        search_db::list_indexable_files(None, "eval-vault", vault_tmp.path()).expect("list files");
    for abs in &files {
        let Ok(markdown) = std::fs::read_to_string(abs) else {
            continue;
        };
        let note_id = search_db::extract_file_meta(abs, vault_tmp.path())
            .expect("extract meta")
            .path;
        let title = search_db::get_note_title(&conn, &note_id).expect("indexed note title");
        apply_note_embedding_on_save(
            &conn,
            &note_id,
            &title,
            &markdown,
            &note_index,
            &block_index,
            true,
            true,
            Some(&model as &dyn SaveEncoder),
        );
    }

    let raw_queries = std::fs::read_to_string(&queries_path).expect("read queries fixture");
    let fixture: FixtureQueries = serde_json::from_str(&raw_queries).expect("parse queries fixture");

    let mut by_mode: HashMap<&'static str, MetricAcc> = HashMap::new();
    let mut by_mode_type: HashMap<(&'static str, String), MetricAcc> = HashMap::new();
    let mut types_seen: Vec<String> = Vec::new();
    let mut unsupported = 0usize;

    for q in &fixture.queries {
        // A folder/tag scope resolves to L3's ScopeFilter and is scored like
        // any other query; a `bases` scope has no eval-harness resolver and
        // is reported unsupported rather than silently scored unscoped.
        let scope_filter: Option<ScopeFilter> = match &q.scope {
            None => None,
            Some(raw) => match parse_scope(&conn, raw) {
                Some(sf) => Some(sf),
                None => {
                    unsupported += 1;
                    continue;
                }
            },
        };

        if !types_seen.contains(&q.kind) {
            types_seen.push(q.kind.clone());
        }

        let expected: Vec<ExpectedHit> = q
            .expected
            .iter()
            .map(|e| ExpectedHit { path: e.path.clone(), heading_id: e.heading_id.clone() })
            .collect();
        let date_range = q.date_range.as_ref().map(|d| {
            (parse_rfc3339_utc_ms(&d.from), parse_rfc3339_utc_ms(&d.to) + 1000)
        });
        let limit = TOP_N.max(q.k);
        let scope_ref = scope_filter.as_ref();

        let results: [(&'static str, Vec<(String, Option<String>)>); 4] = [
            ("fts", run_fts(&conn, &q.query, limit, date_range, scope_ref)),
            (
                "vector",
                run_vector(&conn, &note_index, &model, &q.query, limit, date_range, scope_ref),
            ),
            (
                "hybrid",
                run_hybrid(&conn, &note_index, &model, &q.query, limit, date_range, scope_ref),
            ),
            (
                "blocks",
                run_blocks(&conn, &block_index, &model, &q.query, limit, date_range, scope_ref),
            ),
        ];

        for (mode, hits) in results {
            by_mode.entry(mode).or_default().record(&hits, &expected);
            by_mode_type
                .entry((mode, q.kind.clone()))
                .or_default()
                .record(&hits, &expected);
        }
    }

    types_seen.sort();

    println!(
        "\n=== retrieval eval: {} queries, {unsupported} unsupported (bases scope) ===",
        fixture.queries.len()
    );
    for mode in MODES {
        println!("-- {mode} --");
        if let Some(acc) = by_mode.get(mode) {
            println!("  overall: {}", acc.line());
        }
        for kind in &types_seen {
            if let Some(acc) = by_mode_type.get(&(mode, kind.clone())) {
                println!("  {kind}: {}", acc.line());
            }
        }
    }

    if let Ok(out_path) = std::env::var("CARBIDE_EVAL_OUT") {
        let mut report = serde_json::Map::new();
        for mode in MODES {
            let mut mode_obj = serde_json::Map::new();
            if let Some(acc) = by_mode.get(mode) {
                mode_obj.insert("overall".to_string(), acc.as_json());
            }
            let mut by_type = serde_json::Map::new();
            for kind in &types_seen {
                if let Some(acc) = by_mode_type.get(&(mode, kind.clone())) {
                    by_type.insert(kind.clone(), acc.as_json());
                }
            }
            mode_obj.insert("by_type".to_string(), serde_json::Value::Object(by_type));
            report.insert(mode.to_string(), serde_json::Value::Object(mode_obj));
        }
        report.insert("unsupported".to_string(), serde_json::json!(unsupported));
        std::fs::write(
            &out_path,
            serde_json::to_string_pretty(&serde_json::Value::Object(report)).expect("serialize report"),
        )
        .expect("write eval report");
    }
}
