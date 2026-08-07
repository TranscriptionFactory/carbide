use crate::features::search::embedding_model::{
    self, Pooling, DEFAULT_MODEL_SHORT_ID, EMBEDDING_MODELS,
};
use crate::features::search::embeddings::{
    chunk_by_offsets, normalize_rows, pool_and_normalize, pool_on_device,
};
use crate::features::search::hnsw_index::{SharedVectorIndex, VectorIndex};
use crate::features::search::service::reconcile_model_version;
use crate::features::search::vector_db;
use candle_core::{Device, Tensor};
use rusqlite::Connection;
use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

const TOLERANCE: f32 = 1e-5;

fn assert_close(actual: &[Vec<f32>], expected: &[Vec<f32>]) {
    assert_eq!(actual.len(), expected.len(), "row count");
    for (row, (a, e)) in actual.iter().zip(expected.iter()).enumerate() {
        assert_eq!(a.len(), e.len(), "row {row} width");
        for (i, (x, y)) in a.iter().zip(e.iter()).enumerate() {
            assert!(
                (x - y).abs() < TOLERANCE,
                "row {row} dim {i}: {x} != {y}\n  actual:   {a:?}\n  expected: {e:?}"
            );
        }
    }
}

fn l2_norm(v: &[f32]) -> f32 {
    v.iter().map(|x| x * x).sum::<f32>().sqrt()
}

/// One batch of two sequences: three positions, four dims, second sequence
/// padded at its last position.
fn fixture() -> (Vec<Vec<Vec<f32>>>, Vec<Vec<u32>>) {
    let hidden = vec![
        vec![
            vec![1.0, 0.0, 0.0, 0.0],
            vec![0.0, 2.0, 0.0, 0.0],
            vec![0.0, 0.0, 3.0, 0.0],
        ],
        vec![
            vec![0.0, 1.0, 1.0, 0.0],
            vec![2.0, 0.0, 0.0, 2.0],
            vec![9.0, 9.0, 9.0, 9.0],
        ],
    ];
    let mask = vec![vec![1, 1, 1], vec![1, 1, 0]];
    (hidden, mask)
}

#[test]
fn cls_pooling_takes_row_zero_and_ignores_later_positions() {
    let (mut hidden, mask) = fixture();
    let baseline = pool_and_normalize(&hidden, &mask, Pooling::Cls);

    assert_close(
        &baseline,
        &[
            vec![1.0, 0.0, 0.0, 0.0],
            vec![0.0, 0.5_f32.sqrt(), 0.5_f32.sqrt(), 0.0],
        ],
    );

    for sequence in hidden.iter_mut() {
        for token in sequence.iter_mut().skip(1) {
            token.iter_mut().for_each(|x| *x = -42.0);
        }
    }
    assert_close(
        &pool_and_normalize(&hidden, &mask, Pooling::Cls),
        &baseline,
    );
}

#[test]
fn mean_pooling_ignores_padded_positions() {
    let (mut hidden, mask) = fixture();
    let baseline = pool_and_normalize(&hidden, &mask, Pooling::Mean);

    // Sequence 0 keeps all three positions; sequence 1 averages only its first two.
    assert_close(
        &baseline,
        &[
            normalize_rows(vec![vec![1.0 / 3.0, 2.0 / 3.0, 1.0, 0.0]])[0].clone(),
            normalize_rows(vec![vec![1.0, 0.5, 0.5, 1.0]])[0].clone(),
        ],
    );

    hidden[1][2] = vec![-1000.0, 7.0, 0.25, 3.0];
    assert_close(
        &pool_and_normalize(&hidden, &mask, Pooling::Mean),
        &baseline,
    );
}

#[test]
fn both_strategies_produce_unit_norm_rows() {
    let (hidden, mask) = fixture();
    for strategy in [Pooling::Cls, Pooling::Mean] {
        for row in pool_and_normalize(&hidden, &mask, strategy) {
            assert!(
                (l2_norm(&row) - 1.0).abs() < TOLERANCE,
                "{strategy:?} produced a non-unit row: {row:?}"
            );
        }
    }
}

#[test]
fn degenerate_norms_never_produce_nan() {
    let hidden = vec![
        vec![vec![0.0, 0.0, 0.0]],
        vec![vec![f32::MAX, f32::MAX, f32::MAX]],
        vec![vec![f32::INFINITY, 0.0, 0.0]],
    ];
    let mask = vec![vec![1], vec![1], vec![1]];

    for strategy in [Pooling::Cls, Pooling::Mean] {
        for row in pool_and_normalize(&hidden, &mask, strategy) {
            assert!(
                row.iter().all(|x| x.is_finite()),
                "{strategy:?} leaked a non-finite value into the graph: {row:?}"
            );
        }
    }
}

// The on-device path is the one production runs; the pure function above is the
// contract. Divergence between them would be silent, so assert equivalence.
#[test]
fn on_device_pooling_matches_the_cpu_reference() {
    let (hidden, mask) = fixture();
    let device = Device::Cpu;
    let hidden_tensor = Tensor::new(hidden.clone(), &device).expect("hidden tensor");
    let mask_tensor = Tensor::new(mask.clone(), &device).expect("mask tensor");

    for strategy in [Pooling::Cls, Pooling::Mean] {
        let pooled = pool_on_device(&hidden_tensor, &mask_tensor, strategy)
            .expect("device pool")
            .to_vec2::<f32>()
            .expect("pooled rows");
        assert_close(
            &normalize_rows(pooled),
            &pool_and_normalize(&hidden, &mask, strategy),
        );
    }
}

#[test]
fn chunking_covers_every_token_and_survives_multibyte_text() {
    // "é" is two bytes, so every offset past it is shifted by one.
    let text = "\u{e9}toile brille loin";
    let offsets: Vec<(usize, usize)> = vec![(0, 7), (8, 14), (15, 19)];

    assert_eq!(
        chunk_by_offsets(text, &offsets, 2),
        vec!["\u{e9}toile brille".to_string(), "loin".to_string()],
        "chunks must join back to the full text, minus separators"
    );
    assert_eq!(chunk_by_offsets(text, &offsets, 8), vec![text.to_string()]);
}

#[test]
fn chunk_boundaries_inside_a_codepoint_do_not_drop_the_chunk() {
    // "e-acute" occupies bytes 0..2; a normalizer can hand back an offset of 1.
    let text = "\u{e9}abcdef";
    let offsets: Vec<(usize, usize)> = vec![(0, 1), (1, 4), (4, 7)];

    let chunks = chunk_by_offsets(text, &offsets, 1);
    assert_eq!(chunks.len(), 3);
    assert!(
        chunks.iter().all(|c| !c.is_empty()),
        "a mid-codepoint offset must be snapped, not dropped: {chunks:?}"
    );
}

#[test]
fn chunking_never_returns_nothing() {
    assert_eq!(chunk_by_offsets("body", &[], 4), vec!["body".to_string()]);
    assert_eq!(
        chunk_by_offsets("   ", &[(0, 3)], 1),
        vec!["   ".to_string()],
        "an all-blank input still round-trips rather than vanishing"
    );
}

fn ts_model_ids() -> BTreeSet<String> {
    let ts_path: PathBuf = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("src/lib/shared/types/editor_settings.ts");
    let source = fs::read_to_string(&ts_path)
        .unwrap_or_else(|e| panic!("cannot read TS source at {}: {}", ts_path.display(), e));

    const MARKER: &str = "export type EmbeddingModelId =";
    let start = source
        .find(MARKER)
        .expect("`export type EmbeddingModelId =` not found in editor_settings.ts");
    let rest = &source[start + MARKER.len()..];
    let end = rest
        .find(';')
        .expect("unterminated EmbeddingModelId union in editor_settings.ts");

    let ids: BTreeSet<String> = rest[..end]
        .split('"')
        .skip(1)
        .step_by(2)
        .map(str::to_string)
        .collect();
    assert!(
        !ids.is_empty(),
        "parsed zero ids from EmbeddingModelId — the scraper is out of sync with the TS file"
    );
    ids
}

#[test]
fn registry_covers_every_model_the_ui_offers() {
    let rust_ids: BTreeSet<String> = EMBEDDING_MODELS
        .iter()
        .map(|m| m.short_id.to_string())
        .collect();
    let ts_ids = ts_model_ids();

    assert_eq!(
        rust_ids, ts_ids,
        "EMBEDDING MODEL REGISTRY DRIFT — update BOTH sides to keep them in sync:\n\
         Rust EMBEDDING_MODELS (search/embedding_model.rs, decides pooling + query prefix) \u{2194} \
         TS EmbeddingModelId (shared/types/editor_settings.ts, what the settings UI offers)\n\
         An id only in TS is selectable but embeds with the DEFAULT model's weights and \
         pooling, while the stored model_version records the id the user asked for."
    );
}

#[test]
fn registry_records_the_pooling_each_model_was_trained_with() {
    for short_id in [
        "snowflake-arctic-embed-xs",
        "snowflake-arctic-embed-s",
        "snowflake-arctic-embed-m",
        "bge-small-en-v1.5",
    ] {
        let model = embedding_model::lookup(short_id);
        assert_eq!(model.pooling, Pooling::Cls, "{short_id} is CLS-pooled");
        assert!(
            model.query_prefix.is_some(),
            "{short_id} is asymmetric and needs a query prefix"
        );
    }

    let minilm = embedding_model::lookup("all-MiniLM-L6-v2");
    assert_eq!(minilm.pooling, Pooling::Mean);
    assert!(minilm.query_prefix.is_none());
}

#[test]
fn unknown_model_ids_fall_back_to_the_default() {
    let fallback = embedding_model::lookup("not-a-real-model");
    assert_eq!(fallback.short_id, DEFAULT_MODEL_SHORT_ID);
    assert_eq!(fallback.dims, 384);
}

#[test]
fn seeded_default_matches_the_composite_version_token() {
    assert_eq!(
        vector_db::DEFAULT_MODEL_VERSION,
        embedding_model::model_version_token(DEFAULT_MODEL_SHORT_ID),
        "the schema seed and the runtime token must agree, or every fresh DB \
         re-embeds itself on first launch"
    );
}

fn shared_index() -> SharedVectorIndex {
    Arc::new(RwLock::new(VectorIndex::new(384)))
}

fn conn_with_stored_version(version: &str) -> Connection {
    let conn = Connection::open_in_memory().expect("in-memory db");
    vector_db::init_vector_schema(&conn).expect("vector schema");
    vector_db::set_model_version(&conn, version).expect("seed version");
    vector_db::upsert_embedding(&conn, "n.md", &[0.5_f32; 4]).expect("seed note embedding");
    vector_db::upsert_block_embedding(&conn, "n.md", "h-1-a-0", &[0.5_f32; 4], "hash")
        .expect("seed block embedding");
    conn
}

#[test]
fn stale_encoding_is_wiped_and_the_new_token_recorded() {
    // The bare short id is what every pre-v2 database stored.
    let conn = conn_with_stored_version(DEFAULT_MODEL_SHORT_ID);

    reconcile_model_version(&conn, DEFAULT_MODEL_SHORT_ID, &shared_index(), &shared_index());

    assert!(
        vector_db::get_embedded_paths(&conn).is_empty(),
        "mean-pooled vectors must not survive into a CLS-pooled graph"
    );
    assert!(vector_db::get_block_hashes(&conn, "n.md").is_empty());
    assert_eq!(
        vector_db::get_model_version(&conn).as_deref(),
        Some(embedding_model::model_version_token(DEFAULT_MODEL_SHORT_ID).as_str())
    );
}

#[test]
fn matching_encoding_leaves_stored_vectors_alone() {
    let token = embedding_model::model_version_token(DEFAULT_MODEL_SHORT_ID);
    let conn = conn_with_stored_version(&token);

    reconcile_model_version(&conn, DEFAULT_MODEL_SHORT_ID, &shared_index(), &shared_index());

    assert_eq!(vector_db::get_embedded_paths(&conn).len(), 1);
    assert_eq!(vector_db::get_block_hashes(&conn, "n.md").len(), 1);
}

fn handle_embed_batch_body() -> String {
    let source = fs::read_to_string(
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/features/search/service.rs"),
    )
    .expect("read service.rs");
    let start = source
        .find("fn handle_embed_batch(")
        .expect("handle_embed_batch not found");
    let rest = &source[start..];
    let end = rest
        .find("\nfn ")
        .map(|i| i + 1)
        .unwrap_or(rest.len());
    rest[..end].to_string()
}

// Both early returns below sit on the paths that most need the wipe: embedding
// switched off, and a machine that is offline or has a cold model cache. A
// version check underneath either of them leaves stale vectors forever.
#[test]
fn version_reconcile_precedes_both_early_returns() {
    let body = handle_embed_batch_body();

    let reconcile = body
        .find("reconcile_model_version(")
        .expect("handle_embed_batch no longer calls reconcile_model_version");
    let flags_return = body
        .find("if !note_embed_enabled && !block_embed_enabled {")
        .expect("the both-flags-off early return moved or was renamed");
    let model_init = body
        .find(".get_or_init(")
        .expect("the model init call moved or was renamed");

    assert!(
        reconcile < flags_return,
        "reconcile_model_version must run before the both-flags-off return"
    );
    assert!(
        reconcile < model_init,
        "reconcile_model_version must run before the model load, which fails \
         (and returns) on any offline or cold-cache machine"
    );
}
