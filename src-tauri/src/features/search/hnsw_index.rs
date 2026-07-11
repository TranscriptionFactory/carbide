use hnsw_rs::anndists::dist::distances::DistCosine;
use hnsw_rs::api::AnnT;
use hnsw_rs::hnsw::Hnsw;
use hnsw_rs::hnswio::HnswIo;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{Arc, RwLock};

const MAX_NB_CONNECTION: usize = 16;
const NB_LAYER: usize = 16;
const EF_CONSTRUCTION: usize = 200;

/// Bump when the persisted companion layout changes so old dumps are rejected.
const META_FORMAT_VERSION: u32 = 1;

pub type SharedVectorIndex = Arc<RwLock<VectorIndex>>;

/// Companion metadata persisted next to the hnsw graph dump. The graph files
/// hold the points + `d_id`s; this restores our external side maps and guards
/// against reloading a dump built by a different model/layout.
#[derive(Serialize, Deserialize)]
struct IndexMeta {
    format_version: u32,
    model_version: String,
    dims: usize,
    next_id: usize,
    graph_basename: String,
    id_to_key: Vec<(usize, String)>,
}

pub struct VectorIndex {
    dims: usize,
    hnsw: Hnsw<'static, f32, DistCosine>,
    key_to_id: HashMap<String, usize>,
    id_to_key: HashMap<usize, String>,
    vectors: HashMap<String, Vec<f32>>,
    next_id: usize,
    dirty: bool,
}

impl VectorIndex {
    pub fn new(dims: usize) -> Self {
        let hnsw = Hnsw::new(
            MAX_NB_CONNECTION,
            10_000,
            NB_LAYER,
            EF_CONSTRUCTION,
            DistCosine,
        );
        Self {
            dims,
            hnsw,
            key_to_id: HashMap::new(),
            id_to_key: HashMap::new(),
            vectors: HashMap::new(),
            next_id: 0,
            dirty: false,
        }
    }

    /// Single SQL path shared by rebuild and dump-reconcile: yields every
    /// non-empty embedding as `(key, vector)`. Notes are keyed by `path`; blocks
    /// by `format!("{path}\0{heading_id}")`.
    fn for_each_embedding(
        conn: &rusqlite::Connection,
        index_name: &str,
        mut f: impl FnMut(String, Vec<f32>),
    ) {
        match index_name {
            "notes" => {
                let mut stmt = match conn.prepare("SELECT path, embedding FROM note_embeddings") {
                    Ok(s) => s,
                    Err(e) => {
                        log::warn!("VectorIndex::for_each_embedding(notes): {e}");
                        return;
                    }
                };
                let rows = match stmt.query_map([], |row| {
                    let path: String = row.get(0)?;
                    let blob: Vec<u8> = row.get(1)?;
                    Ok((path, blob))
                }) {
                    Ok(r) => r,
                    Err(e) => {
                        log::warn!("VectorIndex::for_each_embedding(notes): {e}");
                        return;
                    }
                };
                for row in rows.flatten() {
                    let vec = super::vector_db::bytes_to_floats(&row.1);
                    if !vec.is_empty() {
                        f(row.0, vec);
                    }
                }
            }
            "blocks" => {
                let mut stmt = match conn
                    .prepare("SELECT path, heading_id, embedding FROM block_embeddings")
                {
                    Ok(s) => s,
                    Err(e) => {
                        log::warn!("VectorIndex::for_each_embedding(blocks): {e}");
                        return;
                    }
                };
                let rows = match stmt.query_map([], |row| {
                    let path: String = row.get(0)?;
                    let heading_id: String = row.get(1)?;
                    let blob: Vec<u8> = row.get(2)?;
                    Ok((path, heading_id, blob))
                }) {
                    Ok(r) => r,
                    Err(e) => {
                        log::warn!("VectorIndex::for_each_embedding(blocks): {e}");
                        return;
                    }
                };
                for row in rows.flatten() {
                    let key = format!("{}\0{}", row.0, row.1);
                    let vec = super::vector_db::bytes_to_floats(&row.2);
                    if !vec.is_empty() {
                        f(key, vec);
                    }
                }
            }
            _ => {
                log::warn!("VectorIndex::for_each_embedding: unknown index_name={index_name}");
            }
        }
    }

    fn peek_dims(conn: &rusqlite::Connection, index_name: &str) -> Option<usize> {
        let sql = match index_name {
            "notes" => "SELECT embedding FROM note_embeddings LIMIT 1",
            "blocks" => "SELECT embedding FROM block_embeddings LIMIT 1",
            _ => return None,
        };
        conn.query_row(sql, [], |row| row.get::<_, Vec<u8>>(0))
            .ok()
            .map(|blob| super::vector_db::bytes_to_floats(&blob).len())
            .filter(|n| *n > 0)
    }

    pub fn rebuild_from_sqlite(conn: &rusqlite::Connection, index_name: &str, dims: usize) -> Self {
        let mut idx = Self::new(dims);
        let start = std::time::Instant::now();

        Self::for_each_embedding(conn, index_name, |key, vec| {
            idx.insert(&key, vec);
        });

        let elapsed = start.elapsed();
        log::info!(
            "VectorIndex::rebuild_from_sqlite({index_name}): loaded {} vectors in {:.1}ms",
            idx.len(),
            elapsed.as_secs_f64() * 1000.0
        );

        idx
    }

    pub fn insert(&mut self, str_key: &str, vector: Vec<f32>) {
        // The active model's output dimension is not known when the index is
        // constructed (the model loads lazily and is user-configurable), so an
        // empty index conforms to whatever the first inserted vector provides.
        // If the dimension actually changes (embedding model switched), rebuild
        // the empty graph so no stale points of the old dimension remain — a
        // cosine distance across mismatched lengths would otherwise be invalid.
        if self.key_to_id.is_empty() && vector.len() != self.dims {
            self.dims = vector.len();
            self.hnsw = Hnsw::new(
                MAX_NB_CONNECTION,
                10_000,
                NB_LAYER,
                EF_CONSTRUCTION,
                DistCosine,
            );
            self.id_to_key.clear();
            self.next_id = 0;
        }

        if vector.is_empty() || vector.len() != self.dims {
            return;
        }

        // If key already exists, mark old entry stale (we can't remove from HNSW)
        // and overwrite key maps + vectors
        if let Some(&old_id) = self.key_to_id.get(str_key) {
            self.id_to_key.remove(&old_id);
            // old_id stays in HNSW but won't map to any key → filtered out in search
        }

        let id = self.next_id;
        self.next_id += 1;

        // hnsw_rs clones the slice internally via to_vec()
        self.hnsw.insert((&vector, id));

        self.key_to_id.insert(str_key.to_string(), id);
        self.id_to_key.insert(id, str_key.to_string());
        self.vectors.insert(str_key.to_string(), vector);
        self.dirty = true;
    }

    pub fn remove(&mut self, str_key: &str) {
        if let Some(id) = self.key_to_id.remove(str_key) {
            self.id_to_key.remove(&id);
            self.vectors.remove(str_key);
            self.dirty = true;
        }
    }

    pub fn remove_by_prefix(&mut self, prefix: &str) {
        let keys: Vec<String> = self
            .key_to_id
            .keys()
            .filter(|k| k.starts_with(prefix))
            .cloned()
            .collect();
        for key in keys {
            self.remove(&key);
        }
    }

    pub fn rename(&mut self, old_key: &str, new_key: &str) {
        if let Some(id) = self.key_to_id.remove(old_key) {
            if let Some(vec) = self.vectors.remove(old_key) {
                self.vectors.insert(new_key.to_string(), vec);
            }
            self.key_to_id.insert(new_key.to_string(), id);
            self.id_to_key.insert(id, new_key.to_string());
            self.dirty = true;
        }
    }

    pub fn rename_by_prefix(&mut self, old_prefix: &str, new_prefix: &str) {
        let keys: Vec<String> = self
            .key_to_id
            .keys()
            .filter(|k| k.starts_with(old_prefix))
            .cloned()
            .collect();
        for old_key in keys {
            let new_key = format!("{new_prefix}{}", &old_key[old_prefix.len()..]);
            self.rename(&old_key, &new_key);
        }
    }

    pub fn clear(&mut self) {
        self.hnsw = Hnsw::new(
            MAX_NB_CONNECTION,
            10_000,
            NB_LAYER,
            EF_CONSTRUCTION,
            DistCosine,
        );
        self.key_to_id.clear();
        self.id_to_key.clear();
        self.vectors.clear();
        self.next_id = 0;
        self.dirty = true;
    }

    pub fn search(&self, query: &[f32], limit: usize) -> Vec<(String, f32)> {
        if self.key_to_id.is_empty() || query.len() != self.dims {
            return vec![];
        }

        // Over-fetch to account for stale entries
        let fetch = (limit + self.stale_count()).max(limit * 2);
        // HNSW requires ef >= the number of neighbours requested; clamping ef to
        // `fetch` keeps recall from collapsing once stale entries inflate `fetch`.
        let ef_search = fetch.max(32);
        let neighbours = self.hnsw.search(query, fetch, ef_search);

        let mut results = Vec::with_capacity(limit);
        for n in neighbours {
            if let Some(key) = self.id_to_key.get(&n.d_id) {
                results.push((key.clone(), n.distance));
                if results.len() >= limit {
                    break;
                }
            }
        }
        results
    }

    pub fn get_vector(&self, str_key: &str) -> Option<&Vec<f32>> {
        self.vectors.get(str_key)
    }

    pub fn len(&self) -> usize {
        self.key_to_id.len()
    }

    pub fn is_empty(&self) -> bool {
        self.key_to_id.is_empty()
    }

    pub fn keys_with_prefix(&self, prefix: &str) -> Vec<String> {
        self.key_to_id
            .keys()
            .filter(|k| k.starts_with(prefix))
            .cloned()
            .collect()
    }

    fn stale_count(&self) -> usize {
        self.next_id.saturating_sub(self.key_to_id.len())
    }

    pub fn needs_rebuild(&self) -> bool {
        let total = self.next_id;
        let stale = self.stale_count();
        // Rebuild if >30% of entries are stale and we have a meaningful number
        total > 100 && stale * 100 / total > 30
    }

    pub fn compact_from_vectors(&mut self) {
        let old_vectors: Vec<(String, Vec<f32>)> = self.vectors.drain().collect();

        self.hnsw = Hnsw::new(
            MAX_NB_CONNECTION,
            old_vectors.len().max(1000),
            NB_LAYER,
            EF_CONSTRUCTION,
            DistCosine,
        );
        self.key_to_id.clear();
        self.id_to_key.clear();
        self.next_id = 0;

        for (key, vec) in old_vectors {
            self.insert(&key, vec);
        }
    }

    /// Compacts the graph in place when stale (overwritten/removed) nodes exceed
    /// the rebuild threshold, reclaiming the dead nodes that `hnsw_rs` cannot
    /// delete. Returns whether a compaction ran. Cheap to call when not stale.
    pub fn compact_if_stale(&mut self) -> bool {
        if self.needs_rebuild() {
            self.compact_from_vectors();
            true
        } else {
            false
        }
    }

    pub fn is_dirty(&self) -> bool {
        self.dirty
    }

    pub fn mark_clean(&mut self) {
        self.dirty = false;
    }

    /// Persists the built graph (`<basename>.hnsw.graph` + `.hnsw.data`) plus a
    /// companion `<basename>.hnsw.meta` holding our side maps. The meta is
    /// written atomically (temp + rename) so a killed dump never leaves a
    /// half-written companion that would mis-map `d_id`s on reload.
    pub fn dump(&self, dir: &Path, basename: &str, model_version: &str) -> anyhow::Result<()> {
        std::fs::create_dir_all(dir)?;
        let graph_basename = self.hnsw.file_dump(dir, basename)?;

        let meta = IndexMeta {
            format_version: META_FORMAT_VERSION,
            model_version: model_version.to_string(),
            dims: self.dims,
            next_id: self.next_id,
            graph_basename,
            id_to_key: self.id_to_key.iter().map(|(k, v)| (*k, v.clone())).collect(),
        };

        let meta_path = dir.join(format!("{basename}.hnsw.meta"));
        let tmp_path = dir.join(format!("{basename}.hnsw.meta.tmp"));
        std::fs::write(&tmp_path, serde_json::to_vec(&meta)?)?;
        std::fs::rename(&tmp_path, &meta_path)?;
        Ok(())
    }

    /// Loads a previously dumped graph if the companion meta matches the
    /// expected model/layout. Returns `None` (never an error) on any mismatch
    /// or missing/corrupt file, so the caller falls back to a clean rebuild.
    /// The reloaded index has an empty `vectors` map; call
    /// [`reconcile_from_sqlite`] to repopulate it and apply deltas.
    pub fn load_from_dump(
        dir: &Path,
        basename: &str,
        expected_model_version: &str,
        expected_dims: usize,
    ) -> Option<Self> {
        let meta_path = dir.join(format!("{basename}.hnsw.meta"));
        let bytes = std::fs::read(&meta_path).ok()?;
        let meta: IndexMeta = serde_json::from_slice(&bytes).ok()?;

        if meta.format_version != META_FORMAT_VERSION
            || meta.model_version != expected_model_version
            || meta.dims != expected_dims
        {
            return None;
        }

        // The graph companion files must exist; `HnswIo` opens them with an
        // internal `.unwrap()`, so a present-meta/absent-graph state would panic
        // the caller rather than fall back. Check first and bail cleanly.
        let graph_file = dir.join(format!("{}.hnsw.graph", meta.graph_basename));
        let data_file = dir.join(format!("{}.hnsw.data", meta.graph_basename));
        if !graph_file.exists() || !data_file.exists() {
            return None;
        }

        // `load_hnsw` borrows the `HnswIo` for the lifetime of the returned
        // graph. With default (non-mmap) reload the points own their data, so we
        // leak the small `HnswIo` to obtain the `'static` the field requires.
        // This is a rare (per index load, startup only), few-KB intentional leak.
        // The leak lives inside the closure so the returned graph borrows only
        // the leaked `'static` heap — not a captured variable — which lets
        // `catch_unwind` backstop a corrupt/truncated graph (surfaced as a panic
        // mid-read rather than an `Err`) without the borrow escaping.
        let dir_owned = dir.to_path_buf();
        let graph_basename = meta.graph_basename;
        let loaded = std::panic::catch_unwind(std::panic::AssertUnwindSafe(
            move || -> anyhow::Result<Hnsw<'static, f32, DistCosine>> {
                let hnswio = Box::leak(Box::new(HnswIo::new(&dir_owned, &graph_basename)));
                HnswIo::load_hnsw::<f32, DistCosine>(hnswio)
            },
        ));
        let hnsw = match loaded {
            Ok(Ok(h)) => h,
            Ok(Err(e)) => {
                log::warn!("VectorIndex::load_from_dump({basename}): {e}");
                return None;
            }
            Err(_) => {
                log::warn!("VectorIndex::load_from_dump({basename}): corrupt graph, rebuilding");
                return None;
            }
        };

        let id_to_key: HashMap<usize, String> = meta.id_to_key.into_iter().collect();
        let key_to_id: HashMap<String, usize> =
            id_to_key.iter().map(|(id, key)| (key.clone(), *id)).collect();

        Some(Self {
            dims: meta.dims,
            hnsw,
            key_to_id,
            id_to_key,
            vectors: HashMap::new(),
            next_id: meta.next_id,
            dirty: false,
        })
    }

    /// Repopulates the `vectors` map from SQLite and applies any deltas since the
    /// dump: inserts keys new to the graph, removes loaded keys no longer in
    /// SQLite. Makes a slightly-stale dump correct and restores `get_vector` /
    /// `compact_from_vectors`. Only flips `dirty` when a delta is applied.
    pub fn reconcile_from_sqlite(&mut self, conn: &rusqlite::Connection, index_name: &str) {
        let mut seen: HashSet<String> = HashSet::with_capacity(self.key_to_id.len());
        Self::for_each_embedding(conn, index_name, |key, vec| {
            seen.insert(key.clone());
            if self.key_to_id.contains_key(&key) {
                self.vectors.insert(key, vec);
            } else {
                self.insert(&key, vec);
            }
        });

        let removed: Vec<String> = self
            .key_to_id
            .keys()
            .filter(|k| !seen.contains(*k))
            .cloned()
            .collect();
        for key in removed {
            self.remove(&key);
        }
    }

    /// Startup entry point: load the persisted graph and reconcile against
    /// SQLite, or rebuild from scratch when no valid dump exists. A freshly
    /// rebuilt (or delta-reconciled) index is left `dirty` so the caller can
    /// persist it for the next launch.
    pub fn load_or_rebuild(
        conn: &rusqlite::Connection,
        index_name: &str,
        dims: usize,
        dir: &Path,
        basename: &str,
        model_version: &str,
    ) -> Self {
        let expected_dims = Self::peek_dims(conn, index_name).unwrap_or(dims);
        match Self::load_from_dump(dir, basename, model_version, expected_dims) {
            Some(mut idx) => {
                idx.reconcile_from_sqlite(conn, index_name);
                log::info!(
                    "VectorIndex::load_or_rebuild({index_name}): loaded {} vectors from dump",
                    idx.len()
                );
                idx
            }
            None => Self::rebuild_from_sqlite(conn, index_name, dims),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unit_vec(seed: f32, dims: usize) -> Vec<f32> {
        let mut v: Vec<f32> = (0..dims).map(|i| (i as f32 * seed) % 1.0).collect();
        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            v.iter_mut().for_each(|x| *x /= norm);
        }
        v
    }

    #[test]
    fn insert_and_search() {
        let mut idx = VectorIndex::new(8);
        let v1 = unit_vec(0.1, 8);
        let v2 = unit_vec(0.2, 8);
        let v3 = unit_vec(0.5, 8);
        let v4 = unit_vec(0.9, 8);

        idx.insert("a", v1.clone());
        idx.insert("b", v2.clone());
        idx.insert("c", v3);
        idx.insert("d", v4);

        let results = idx.search(&v1, 4);
        assert_eq!(results.len(), 4);
        assert_eq!(results[0].0, "a");
        assert_eq!(results[1].0, "b");
    }

    #[test]
    fn remove_filters_from_search() {
        let mut idx = VectorIndex::new(8);
        let v1 = unit_vec(0.1, 8);
        let v2 = unit_vec(0.2, 8);
        idx.insert("a", v1.clone());
        idx.insert("b", v2);

        idx.remove("a");

        let results = idx.search(&v1, 10);
        assert!(results.iter().all(|(k, _)| k != "a"));
        assert_eq!(idx.len(), 1);
    }

    #[test]
    fn remove_by_prefix_works() {
        let mut idx = VectorIndex::new(8);
        idx.insert("dir/a\0h1", unit_vec(0.1, 8));
        idx.insert("dir/a\0h2", unit_vec(0.2, 8));
        idx.insert("dir/b\0h1", unit_vec(0.3, 8));

        idx.remove_by_prefix("dir/a\0");
        assert_eq!(idx.len(), 1);
        assert!(idx.get_vector("dir/a\0h1").is_none());
        assert!(idx.get_vector("dir/b\0h1").is_some());
    }

    #[test]
    fn rename_preserves_vector() {
        let mut idx = VectorIndex::new(8);
        let v = unit_vec(0.5, 8);
        idx.insert("old", v.clone());
        idx.rename("old", "new");

        assert!(idx.get_vector("old").is_none());
        assert_eq!(idx.get_vector("new").unwrap(), &v);
        assert_eq!(idx.len(), 1);
    }

    #[test]
    fn rename_by_prefix_works() {
        let mut idx = VectorIndex::new(8);
        idx.insert("folder/a.md", unit_vec(0.1, 8));
        idx.insert("folder/b.md", unit_vec(0.2, 8));
        idx.insert("other/c.md", unit_vec(0.3, 8));

        idx.rename_by_prefix("folder/", "renamed/");

        assert!(idx.get_vector("folder/a.md").is_none());
        assert!(idx.get_vector("renamed/a.md").is_some());
        assert!(idx.get_vector("renamed/b.md").is_some());
        assert!(idx.get_vector("other/c.md").is_some());
        assert_eq!(idx.len(), 3);
    }

    #[test]
    fn clear_resets_everything() {
        let mut idx = VectorIndex::new(8);
        idx.insert("a", unit_vec(0.1, 8));
        idx.insert("b", unit_vec(0.2, 8));
        idx.clear();

        assert_eq!(idx.len(), 0);
        assert!(idx.search(&unit_vec(0.1, 8), 10).is_empty());
    }

    #[test]
    fn overwrite_replaces_vector() {
        let mut idx = VectorIndex::new(8);
        let v1 = unit_vec(0.1, 8);
        let v2 = unit_vec(0.9, 8);
        idx.insert("key", v1);
        idx.insert("key", v2.clone());

        assert_eq!(idx.get_vector("key").unwrap(), &v2);
        assert_eq!(idx.len(), 1);
    }

    #[test]
    fn adopts_dimension_from_first_vector() {
        // Index constructed with a stale hint dimension; the first inserted
        // vector dictates the real dimension (model output is unknown at build).
        let mut idx = VectorIndex::new(384);
        let v = unit_vec(0.3, 768);
        idx.insert("a", v.clone());

        assert_eq!(idx.len(), 1);
        let results = idx.search(&v, 1);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0, "a");
    }

    #[test]
    fn dimension_change_after_clear_works() {
        // Simulates an embedding-model switch: 384-dim data, clear, then 768-dim.
        let mut idx = VectorIndex::new(384);
        idx.insert("old", unit_vec(0.1, 384));
        idx.clear();

        let v = unit_vec(0.5, 768);
        idx.insert("new", v.clone());

        assert_eq!(idx.len(), 1);
        assert_eq!(idx.get_vector("new").unwrap().len(), 768);
        let results = idx.search(&v, 1);
        assert_eq!(results[0].0, "new");
    }

    #[test]
    fn rejects_mismatched_dimension_while_populated() {
        let mut idx = VectorIndex::new(8);
        idx.insert("a", unit_vec(0.1, 8));
        idx.insert("b", unit_vec(0.2, 16));

        assert_eq!(idx.len(), 1);
        assert!(idx.get_vector("b").is_none());
    }

    #[test]
    fn empty_vector_is_rejected() {
        let mut idx = VectorIndex::new(8);
        idx.insert("a", vec![]);
        assert_eq!(idx.len(), 0);
    }

    #[test]
    fn search_empty_index() {
        let idx = VectorIndex::new(8);
        let results = idx.search(&unit_vec(0.1, 8), 10);
        assert!(results.is_empty());
    }

    #[test]
    fn needs_rebuild_after_many_deletes() {
        let mut idx = VectorIndex::new(8);
        for i in 0..200 {
            idx.insert(&format!("k{i}"), unit_vec(i as f32 * 0.01, 8));
        }
        for i in 0..100 {
            idx.remove(&format!("k{i}"));
        }
        // 100 live, 100 stale out of 200 total → 50% stale
        assert!(idx.needs_rebuild());
    }

    #[test]
    fn compact_preserves_data() {
        let mut idx = VectorIndex::new(8);
        for i in 0..50 {
            idx.insert(&format!("k{i}"), unit_vec(i as f32 * 0.01, 8));
        }
        for i in 0..25 {
            idx.remove(&format!("k{i}"));
        }

        idx.compact_from_vectors();
        assert_eq!(idx.len(), 25);
        assert_eq!(idx.stale_count(), 0);
        // Verify we can still search
        let v = unit_vec(25.0 * 0.01, 8);
        let results = idx.search(&v, 5);
        assert!(!results.is_empty());
    }

    #[test]
    fn compact_if_stale_compacts_only_past_threshold() {
        let mut idx = VectorIndex::new(8);
        for i in 0..200 {
            idx.insert(&format!("k{i}"), unit_vec(i as f32 * 0.01, 8));
        }

        // Below threshold: no compaction, stale nodes retained.
        for i in 0..50 {
            idx.remove(&format!("k{i}"));
        }
        assert_eq!(idx.stale_count(), 50);
        assert!(!idx.compact_if_stale());
        assert_eq!(idx.stale_count(), 50);

        // Past >30% threshold: compaction runs and clears stale nodes losslessly.
        for i in 50..120 {
            idx.remove(&format!("k{i}"));
        }
        assert!(idx.needs_rebuild());
        assert!(idx.compact_if_stale());
        assert_eq!(idx.stale_count(), 0);
        assert_eq!(idx.len(), 80);
        let v = unit_vec(150.0 * 0.01, 8);
        assert!(!idx.search(&v, 5).is_empty());
    }

    fn scratch_dir(tag: &str) -> std::path::PathBuf {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static COUNTER: AtomicUsize = AtomicUsize::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("test-tmp")
            .join(format!("hnsw-{tag}-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn blob(v: &[f32]) -> Vec<u8> {
        v.iter().flat_map(|f| f.to_le_bytes()).collect()
    }

    fn mem_conn(rows: &[(&str, Vec<f32>)]) -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE note_embeddings (path TEXT PRIMARY KEY, embedding BLOB)",
            [],
        )
        .unwrap();
        for (path, vec) in rows {
            conn.execute(
                "INSERT INTO note_embeddings (path, embedding) VALUES (?1, ?2)",
                rusqlite::params![path, blob(vec)],
            )
            .unwrap();
        }
        conn
    }

    #[test]
    fn dump_load_roundtrip_preserves_graph_and_mapping() {
        let dir = scratch_dir("roundtrip");
        let mut idx = VectorIndex::new(8);
        for i in 0..12 {
            idx.insert(&format!("k{i}"), unit_vec(i as f32 * 0.07, 8));
        }
        let query = unit_vec(3.0 * 0.07, 8);
        let before = idx.search(&query, 5);

        idx.dump(&dir, "notes-test", "m1").unwrap();
        let loaded = VectorIndex::load_from_dump(&dir, "notes-test", "m1", 8).unwrap();

        assert_eq!(loaded.len(), idx.len());
        let after = loaded.search(&query, 5);
        assert_eq!(before, after);
    }

    #[test]
    fn load_from_dump_rejects_model_version_mismatch() {
        let dir = scratch_dir("model-mismatch");
        let mut idx = VectorIndex::new(8);
        idx.insert("a", unit_vec(0.1, 8));
        idx.dump(&dir, "notes-test", "m1").unwrap();

        assert!(VectorIndex::load_from_dump(&dir, "notes-test", "m2", 8).is_none());
        assert!(VectorIndex::load_from_dump(&dir, "notes-test", "m1", 8).is_some());
    }

    #[test]
    fn load_from_dump_rejects_dims_mismatch() {
        let dir = scratch_dir("dims-mismatch");
        let mut idx = VectorIndex::new(8);
        idx.insert("a", unit_vec(0.1, 8));
        idx.dump(&dir, "notes-test", "m1").unwrap();

        assert!(VectorIndex::load_from_dump(&dir, "notes-test", "m1", 16).is_none());
    }

    #[test]
    fn load_from_dump_absent_graph_returns_none() {
        let dir = scratch_dir("absent-graph");
        let mut idx = VectorIndex::new(8);
        idx.insert("a", unit_vec(0.1, 8));
        idx.dump(&dir, "notes-test", "m1").unwrap();

        // Meta survives but the graph file is gone (partial deletion / tamper):
        // must fall back cleanly instead of panicking on the internal unwrap.
        std::fs::remove_file(dir.join("notes-test.hnsw.graph")).unwrap();
        assert!(VectorIndex::load_from_dump(&dir, "notes-test", "m1", 8).is_none());
    }

    #[test]
    fn reconcile_applies_added_and_removed_deltas() {
        let dir = scratch_dir("reconcile");
        // Dump holds keys a and b.
        let mut idx = VectorIndex::new(8);
        let va = unit_vec(0.1, 8);
        let vb = unit_vec(0.4, 8);
        idx.insert("a", va.clone());
        idx.insert("b", vb);
        idx.dump(&dir, "notes-test", "m1").unwrap();

        // SQLite has a (unchanged) and c (new); b was deleted.
        let vc = unit_vec(0.9, 8);
        let conn = mem_conn(&[("a", va.clone()), ("c", vc.clone())]);

        let mut loaded = VectorIndex::load_from_dump(&dir, "notes-test", "m1", 8).unwrap();
        loaded.reconcile_from_sqlite(&conn, "notes");

        assert_eq!(loaded.len(), 2);
        assert!(loaded.get_vector("c").is_some());
        assert!(loaded.get_vector("b").is_none());

        let hits_a = loaded.search(&va, 5);
        assert!(hits_a.iter().any(|(k, _)| k == "a"));
        assert!(hits_a.iter().all(|(k, _)| k != "b"));
        let hits_c = loaded.search(&vc, 5);
        assert!(hits_c.iter().any(|(k, _)| k == "c"));
    }

    #[test]
    fn load_or_rebuild_loads_clean_when_dump_fresh() {
        let dir = scratch_dir("fresh-load");
        let va = unit_vec(0.1, 8);
        let conn = mem_conn(&[("a", va.clone())]);
        let idx = VectorIndex::rebuild_from_sqlite(&conn, "notes", 8);
        idx.dump(&dir, "notes-test", "m1").unwrap();

        let loaded = VectorIndex::load_or_rebuild(&conn, "notes", 8, &dir, "notes-test", "m1");

        assert_eq!(loaded.len(), 1);
        assert!(!loaded.is_dirty());
        assert!(loaded.search(&va, 1).iter().any(|(k, _)| k == "a"));
    }

    #[test]
    fn load_or_rebuild_rebuilds_on_model_version_change() {
        let dir = scratch_dir("stale-model");
        let va = unit_vec(0.1, 8);
        let vb = unit_vec(0.5, 8);
        let conn = mem_conn(&[("a", va.clone()), ("b", vb)]);
        let idx = VectorIndex::rebuild_from_sqlite(&conn, "notes", 8);
        idx.dump(&dir, "notes-test", "m1").unwrap();

        let rebuilt = VectorIndex::load_or_rebuild(&conn, "notes", 8, &dir, "notes-test", "m2");

        assert_eq!(rebuilt.len(), 2);
        // A rebuilt index must stay dirty so the caller re-dumps it under the new model.
        assert!(rebuilt.is_dirty());
        assert!(rebuilt.search(&va, 2).iter().any(|(k, _)| k == "a"));
    }

    #[test]
    fn corrupt_meta_falls_back_to_rebuild() {
        let dir = scratch_dir("corrupt-meta");
        let va = unit_vec(0.1, 8);
        let conn = mem_conn(&[("a", va.clone())]);
        let idx = VectorIndex::rebuild_from_sqlite(&conn, "notes", 8);
        idx.dump(&dir, "notes-test", "m1").unwrap();
        std::fs::write(dir.join("notes-test.hnsw.meta"), b"{not json").unwrap();

        let rebuilt = VectorIndex::load_or_rebuild(&conn, "notes", 8, &dir, "notes-test", "m1");

        assert_eq!(rebuilt.len(), 1);
        assert!(rebuilt.is_dirty());
        assert!(rebuilt.search(&va, 1).iter().any(|(k, _)| k == "a"));
    }

    #[test]
    fn corrupt_graph_falls_back_to_rebuild() {
        let dir = scratch_dir("corrupt-graph");
        let va = unit_vec(0.1, 8);
        let conn = mem_conn(&[("a", va.clone())]);
        let idx = VectorIndex::rebuild_from_sqlite(&conn, "notes", 8);
        idx.dump(&dir, "notes-test", "m1").unwrap();
        std::fs::write(dir.join("notes-test.hnsw.graph"), b"garbage").unwrap();

        let rebuilt = VectorIndex::load_or_rebuild(&conn, "notes", 8, &dir, "notes-test", "m1");

        assert_eq!(rebuilt.len(), 1);
        assert!(rebuilt.is_dirty());
        assert!(rebuilt.search(&va, 1).iter().any(|(k, _)| k == "a"));
    }
}
