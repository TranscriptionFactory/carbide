use crate::features::search::hnsw_index::VectorIndex;
use std::sync::atomic::AtomicBool;

const DIMS: usize = 8;

fn unit_vec(seed: usize) -> Vec<f32> {
    let raw: Vec<f32> = (0..DIMS)
        .map(|d| ((seed * 31 + d * 17) % 97) as f32 + 1.0)
        .collect();
    let norm = raw.iter().map(|x| x * x).sum::<f32>().sqrt();
    raw.into_iter().map(|x| x / norm).collect()
}

/// 200 inserted, 120 removed: 60% stale, past the 30% rebuild threshold.
fn stale_index() -> VectorIndex {
    let mut idx = VectorIndex::new(DIMS);
    for i in 0..200 {
        idx.insert(&format!("k{i}"), unit_vec(i));
    }
    for i in 0..120 {
        idx.remove(&format!("k{i}"));
    }
    idx.mark_clean();
    idx
}

fn top_hit(idx: &VectorIndex, seed: usize) -> Option<String> {
    idx.search(&unit_vec(seed), 1)
        .into_iter()
        .next()
        .map(|(key, _)| key)
}

#[test]
fn a_raised_cancel_abandons_the_build() {
    let idx = stale_index();
    assert!(idx.build_compacted(&AtomicBool::new(true)).is_none());
}

#[test]
fn an_abandoned_build_leaves_the_index_unchanged() {
    let idx = stale_index();
    let _ = idx.build_compacted(&AtomicBool::new(true));

    assert!(idx.needs_rebuild());
    assert!(!idx.is_dirty());
    assert_eq!(idx.len(), 80);
    assert_eq!(top_hit(&idx, 150).as_deref(), Some("k150"));
}

#[test]
fn applying_a_build_reclaims_stale_nodes_and_keeps_every_live_key() {
    let mut idx = stale_index();
    let compacted = idx
        .build_compacted(&AtomicBool::new(false))
        .expect("uncancelled build completes");
    idx.apply_compacted(compacted);

    assert!(!idx.needs_rebuild());
    assert!(idx.is_dirty());
    assert_eq!(idx.len(), 80);
    for i in 120..200 {
        assert_eq!(
            top_hit(&idx, i),
            Some(format!("k{i}")),
            "lost live key k{i}"
        );
    }
    assert!(idx
        .search(&unit_vec(5), 80)
        .iter()
        .all(|(key, _)| key != "k5"));
}

#[test]
fn a_compacted_index_keeps_accepting_inserts() {
    let mut idx = stale_index();
    idx.compact_from_vectors();
    idx.insert("fresh", unit_vec(500));

    assert_eq!(idx.len(), 81);
    assert_eq!(top_hit(&idx, 500).as_deref(), Some("fresh"));
}
