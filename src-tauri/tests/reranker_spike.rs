//! Cross-encoder reranker spike: load cost, batch latency, and MRR over a
//! hybrid top-40 on the retrieval eval fixture. Numbers only, no assertions
//! beyond "it ran".
//!
//! CARBIDE_MODEL_CACHE=<dir> CARBIDE_EVAL_FIXTURE=<fixtures/retrieval_eval> \
//!   cargo test --lib reranker_spike -- --ignored --nocapture --test-threads=1

use crate::features::search::db as search_db;
use crate::features::search::embedding_model::DEFAULT_MODEL_SHORT_ID;
use crate::features::search::embeddings::EmbeddingService;
use crate::features::search::hnsw_index::{SharedVectorIndex, VectorIndex};
use crate::features::search::hybrid::hybrid_search;
use crate::features::search::model::SearchScope;
use crate::features::search::reranker::{Reranker, RerankerModel};
use crate::features::search::service::{apply_note_embedding_on_save, SearchQueryInput};
use crate::features::search::vector_db;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

const CANDIDATES: usize = 40;
const LATENCY_RUNS: usize = 5;
const SEQUENTIAL_RUNS: usize = 1;
const MODELS: [RerankerModel; 2] = [RerankerModel::MsMarcoMiniLmL6, RerankerModel::BgeRerankerBase];

#[derive(Deserialize)]
struct QueryFile {
    queries: Vec<EvalQuery>,
}

#[derive(Deserialize)]
struct EvalQuery {
    id: String,
    query: String,
    #[serde(rename = "type")]
    kind: String,
    expected: Vec<Expected>,
}

#[derive(Deserialize)]
struct Expected {
    path: String,
}

struct Candidate {
    path: String,
    note_text: String,
    section_texts: Vec<String>,
}

struct Case {
    query: EvalQuery,
    candidates: Vec<Candidate>,
}

fn env_path(name: &str) -> PathBuf {
    PathBuf::from(std::env::var(name).unwrap_or_else(|_| panic!("{name} must be set")))
}

fn scratch_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmpfiles")
}

fn rss_kb() -> u64 {
    std::fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|s| {
            s.lines()
                .find(|l| l.starts_with("VmRSS:"))
                .and_then(|l| l.split_whitespace().nth(1)?.parse().ok())
        })
        .unwrap_or(0)
}

fn download_mb(cache: &Path, which: RerankerModel) -> f64 {
    let blobs = cache
        .join(format!("models--{}", which.hf_repo().replace('/', "--")))
        .join("blobs");
    let bytes: u64 = std::fs::read_dir(blobs)
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|e| e.metadata().ok())
                .map(|m| m.len())
                .sum()
        })
        .unwrap_or(0);
    bytes as f64 / 1e6
}

fn percentile(sorted: &[Duration], p: f64) -> Duration {
    let rank = ((p * sorted.len() as f64).ceil() as usize).clamp(1, sorted.len());
    sorted[rank - 1]
}

fn ms(d: Duration) -> f64 {
    d.as_secs_f64() * 1e3
}

fn markdown_files(root: &Path, dir: &Path, out: &mut Vec<(String, String)>) {
    for entry in std::fs::read_dir(dir).expect("read vault dir").flatten() {
        let path = entry.path();
        if path.is_dir() {
            markdown_files(root, &path, out);
        } else if path.extension().is_some_and(|e| e == "md") {
            let rel = path.strip_prefix(root).unwrap().to_string_lossy().into_owned();
            out.push((rel, std::fs::read_to_string(&path).expect("read note")));
        }
    }
}

fn section_texts(title: &str, markdown: &str) -> Vec<String> {
    let (_, _, sections) = search_db::extract_markdown_structure(markdown, title);
    let lines: Vec<&str> = markdown.lines().collect();
    sections
        .iter()
        .filter_map(|s| {
            let body = search_db::slice_section_text(&lines, s.start_line, s.end_line)?;
            Some(format!("{title} > {}\n{body}", s.title))
        })
        .collect()
}

fn build_cases(cache: &Path, fixture: &Path, scratch: &Path) -> Vec<Case> {
    let vault = fixture.join("vault");
    let queries: QueryFile = serde_json::from_str(
        &std::fs::read_to_string(fixture.join("queries.json")).expect("read queries"),
    )
    .expect("parse queries");

    let conn = search_db::open_search_db_at_path(&scratch.join("search.db")).expect("db open");
    vector_db::init_vector_schema(&conn).expect("vector schema");
    search_db::rebuild_index(
        None,
        "reranker-spike",
        &conn,
        &vault,
        &AtomicBool::new(false),
        &|_, _| {},
        &mut || {},
    )
    .expect("rebuild index");

    let encoder = EmbeddingService::new(cache.to_path_buf(), DEFAULT_MODEL_SHORT_ID)
        .expect("load embedding model");
    let note_index: SharedVectorIndex = Arc::new(RwLock::new(VectorIndex::new(384)));
    let block_index: SharedVectorIndex = Arc::new(RwLock::new(VectorIndex::new(384)));
    let mut notes = Vec::new();
    markdown_files(&vault, &vault, &mut notes);
    for (path, markdown) in &notes {
        apply_note_embedding_on_save(
            &conn,
            path,
            markdown,
            &note_index,
            &block_index,
            true,
            true,
            Some(&encoder),
        );
    }
    let markdown_by_path: BTreeMap<&str, &str> =
        notes.iter().map(|(p, m)| (p.as_str(), m.as_str())).collect();
    println!(
        "fixture: {} notes indexed, {} note vectors",
        notes.len(),
        note_index.read().unwrap().len()
    );

    let index = note_index.read().unwrap();
    queries
        .queries
        .into_iter()
        .map(|query| {
            let input = SearchQueryInput {
                raw: query.query.clone(),
                text: query.query.clone(),
                scope: SearchScope::All,
            };
            let hits = hybrid_search(&conn, &index, &encoder, &input, CANDIDATES, None, false)
                .expect("hybrid search");
            let candidates = hits
                .into_iter()
                .map(|hit| {
                    let path = hit.note.path;
                    let title = hit.note.title;
                    let body = search_db::get_fts_body(&conn, &path).unwrap_or_default();
                    let markdown = markdown_by_path.get(path.as_str()).copied().unwrap_or("");
                    Candidate {
                        note_text: format!("{title}\n{body}"),
                        section_texts: section_texts(&title, markdown),
                        path,
                    }
                })
                .collect();
            Case { query, candidates }
        })
        .collect()
}

fn reciprocal_rank(order: &[&str], expected: &[Expected]) -> f64 {
    order
        .iter()
        .position(|p| expected.iter().any(|e| e.path == *p))
        .map_or(0.0, |i| 1.0 / (i + 1) as f64)
}

fn sort_by_score<'a>(paths: &[&'a str], scores: &[f32]) -> Vec<&'a str> {
    let mut ranked: Vec<(&str, f32)> = paths.iter().copied().zip(scores.iter().copied()).collect();
    ranked.sort_by(|a, b| b.1.total_cmp(&a.1));
    ranked.into_iter().map(|(p, _)| p).collect()
}

fn sigmoid(x: f32) -> f32 {
    1.0 / (1.0 + (-x).exp())
}

fn blend_weight(rank: usize) -> f32 {
    match rank {
        1..=3 => 0.75,
        4..=10 => 0.60,
        _ => 0.40,
    }
}

fn blended(scores: &[f32]) -> Vec<f32> {
    scores
        .iter()
        .enumerate()
        .map(|(i, s)| {
            let w = blend_weight(i + 1);
            w * (1.0 / (i + 1) as f32) + (1.0 - w) * sigmoid(*s)
        })
        .collect()
}

#[derive(Default)]
struct Mrr {
    by_type: BTreeMap<String, (f64, usize)>,
}

impl Mrr {
    fn add(&mut self, kind: &str, rr: f64) {
        let e = self.by_type.entry(kind.to_string()).or_default();
        e.0 += rr;
        e.1 += 1;
        let all = self.by_type.entry("ALL".to_string()).or_default();
        all.0 += rr;
        all.1 += 1;
    }

    fn get(&self, kind: &str) -> f64 {
        self.by_type.get(kind).map_or(0.0, |(sum, n)| sum / *n as f64)
    }
}

fn evaluate(reranker: &Reranker, cases: &[Case], with_sections: bool) {
    let modes = ["hybrid", "rerank-note", "blend-note", "rerank-maxsec"];
    let modes = &modes[..if with_sections { 4 } else { 3 }];
    let mut mrr: Vec<Mrr> = modes.iter().map(|_| Mrr::default()).collect();

    for case in cases {
        let q = &case.query;
        let paths: Vec<&str> = case.candidates.iter().map(|c| c.path.as_str()).collect();
        let note_texts: Vec<&str> = case.candidates.iter().map(|c| c.note_text.as_str()).collect();
        let note_scores = reranker.score(&q.query, &note_texts).expect("score notes");

        let max_section_scores: Vec<f32> = case
            .candidates
            .iter()
            .zip(&note_scores)
            .filter(|_| with_sections)
            .map(|(c, note_score)| {
                let texts: Vec<&str> = c.section_texts.iter().map(String::as_str).collect();
                reranker
                    .score(&q.query, &texts)
                    .expect("score sections")
                    .into_iter()
                    .fold(*note_score, f32::max)
            })
            .collect();

        let orders = [
            paths.clone(),
            sort_by_score(&paths, &note_scores),
            sort_by_score(&paths, &blended(&note_scores)),
            sort_by_score(&paths, &max_section_scores),
        ];
        let orders = &orders[..if with_sections { 4 } else { 3 }];
        let rrs: Vec<f64> = orders.iter().map(|o| reciprocal_rank(o, &q.expected)).collect();
        for (m, rr) in mrr.iter_mut().zip(&rrs) {
            m.add(&q.kind, *rr);
        }
        if q.kind == "distractor" {
            println!("  {} rr={:?}", q.id, rrs.iter().map(|r| format!("{r:.2}")).collect::<Vec<_>>());
        }
    }

    let kinds: Vec<String> = mrr[0].by_type.keys().cloned().collect();
    println!("  {:<20} {}", "type", modes.iter().map(|m| format!("{m:>14}")).collect::<String>());
    for kind in kinds {
        let row: String = mrr.iter().map(|m| format!("{:>14.3}", m.get(&kind))).collect();
        println!("  {kind:<20} {row}");
    }
}

fn latency_passages(cases: &[Case]) -> Vec<String> {
    let bodies: Vec<&str> = cases[0].candidates.iter().map(|c| c.note_text.as_str()).collect();
    (0..CANDIDATES)
        .map(|i| {
            let mut text = String::new();
            let mut j = i;
            while text.len() < 8_000 {
                text.push_str(bodies[j % bodies.len()]);
                text.push('\n');
                j += 1;
            }
            text
        })
        .collect()
}

fn measure_latency(reranker: &mut Reranker, passages: &[&str], runs: usize) {
    let query = "which backup tool keeps snapshots that cannot be deleted";
    for max_tokens in [256, 512] {
        reranker.set_max_tokens(max_tokens).expect("set max tokens");
        reranker.score(query, passages).expect("warmup");
        let mut timings: Vec<Duration> = (0..runs)
            .map(|_| {
                let start = Instant::now();
                reranker.score(query, passages).expect("batch score");
                start.elapsed()
            })
            .collect();
        timings.sort();

        let sequential: Duration = (0..SEQUENTIAL_RUNS)
            .map(|_| {
                let start = Instant::now();
                for p in passages {
                    reranker.score(query, &[p]).expect("single score");
                }
                start.elapsed()
            })
            .sum::<Duration>()
            / SEQUENTIAL_RUNS as u32;

        println!(
            "  {max_tokens} tok x{}: batch p50={:.0}ms p95={:.0}ms min={:.0}ms | sequential mean={:.0}ms",
            passages.len(),
            ms(percentile(&timings, 0.50)),
            ms(percentile(&timings, 0.95)),
            ms(timings[0]),
            ms(sequential),
        );
    }
    reranker
        .set_max_tokens(crate::features::search::reranker::DEFAULT_MAX_TOKENS)
        .expect("reset max tokens");
}

#[test]
#[ignore = "downloads ~1.3 GB of models and runs CPU benchmarks"]
fn reranker_spike_report() {
    let cache = env_path("CARBIDE_MODEL_CACHE");
    let fixture = env_path("CARBIDE_EVAL_FIXTURE");
    std::fs::create_dir_all(scratch_root()).expect("scratch root");
    let scratch = tempfile::Builder::new()
        .prefix("reranker_spike_")
        .tempdir_in(scratch_root())
        .expect("scratch dir");
    println!(
        "threads: {} (RAYON_NUM_THREADS={:?})",
        candle_core::utils::get_num_threads(),
        std::env::var("RAYON_NUM_THREADS").ok()
    );

    let cases = build_cases(&cache, &fixture, scratch.path());
    let passages = latency_passages(&cases);
    let passages: Vec<&str> = passages.iter().map(String::as_str).collect();

    // Quick mode exists because bge on CPU needs ~2 min per 40x512 batch: it
    // evaluates at 256 tokens without the per-section pass and times a single
    // batch.
    let quick = std::env::var("CARBIDE_RERANKER_QUICK").is_ok();
    let only = std::env::var("CARBIDE_RERANKER_MODEL").unwrap_or_default();
    for which in MODELS.into_iter().filter(|m| m.hf_repo().contains(only.as_str())) {
        println!("== {}", which.hf_repo());
        drop(Reranker::new(cache.clone(), which).expect("download model"));
        println!("  download: {:.0} MB", download_mb(&cache, which));

        let rss_before = rss_kb();
        let start = Instant::now();
        let mut reranker = Reranker::new(cache.clone(), which).expect("load model");
        let load = start.elapsed();
        let rss_loaded = rss_kb();
        reranker.score("warm", &["up"]).expect("first forward");
        let rss_warm = rss_kb();
        println!(
            "  load {:.0}ms; RSS delta after load {:.0} MB, after first forward {:.0} MB",
            ms(load),
            (rss_loaded as f64 - rss_before as f64) / 1024.0,
            (rss_warm as f64 - rss_before as f64) / 1024.0,
        );

        if quick {
            reranker.set_max_tokens(256).expect("set max tokens");
        }
        evaluate(&reranker, &cases, !quick);
        measure_latency(&mut reranker, &passages, if quick { 1 } else { LATENCY_RUNS });
        let rss_peak = rss_kb();
        println!(
            "  RSS delta after 40x512 batches {:.0} MB",
            (rss_peak as f64 - rss_before as f64) / 1024.0
        );
    }
}
