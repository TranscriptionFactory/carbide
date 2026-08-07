//! Runs the real encoder on the real device and reports what it pooled.
//! Ignored by default: it needs the downloaded weights, and on macOS it is the
//! only way to exercise the Metal f16 path that CI never sees.
//!
//! `cargo test --lib embedding_device_probe -- --ignored --nocapture`

use crate::features::search::embedding_model::DEFAULT_MODEL_SHORT_ID;
use crate::features::search::embeddings::EmbeddingService;
use crate::features::search::hnsw_index::is_usable_vector;
use std::path::PathBuf;

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

fn describe(label: &str, rows: &[Vec<f32>]) -> usize {
    let mut unusable = 0;
    for (i, row) in rows.iter().enumerate() {
        let norm = row.iter().map(|x| x * x).sum::<f32>().sqrt();
        let nan = row.iter().filter(|x| x.is_nan()).count();
        let infinite = row.iter().filter(|x| x.is_infinite()).count();
        let zero = row.iter().filter(|x| **x == 0.0).count();
        let usable = is_usable_vector(row);
        if !usable {
            unusable += 1;
        }
        println!(
            "{label} row {i}: dims={} norm={norm} nan={nan} inf={infinite} zero={zero} usable={usable} head={:?}",
            row.len(),
            &row[..row.len().min(4)]
        );
    }
    unusable
}

#[test]
#[ignore = "needs downloaded model weights and the host GPU"]
fn pooled_rows_are_usable_on_this_device() {
    let cache = model_cache_dir();
    println!("model cache: {}", cache.display());
    let model = EmbeddingService::new(cache, DEFAULT_MODEL_SHORT_ID).expect("load model");

    // Batch of one: no padding, so a mask or padding fault cannot reach it.
    let single = model.encode_pooled(&["mitochondrial metabolism in tumour cells"], None);
    let single = single.expect("encode single");
    let single_bad = describe("single", &single);

    // Mixed lengths: BatchLongest pads the short rows, which is where a
    // masking fault in the f16 forward pass would surface first.
    let long = "Integrated multi-omics reveals adaptive anti-oxidant remodeling in early \
                alcohol-associated liver disease. "
        .repeat(12);
    let batch = model
        .encode_pooled(
            &[
                "short note",
                "a second, somewhat longer section about proteomics workflows",
                long.as_str(),
            ],
            None,
        )
        .expect("encode batch");
    let batch_bad = describe("batch", &batch);

    assert_eq!(
        (single_bad, batch_bad),
        (0, 0),
        "encoder pooled rows the ingest guard will refuse"
    );
}
