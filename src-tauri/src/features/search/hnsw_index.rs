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

/// Floor for `Hnsw::new`'s capacity hint, which pre-sizes the layer tables.
/// Every construction site derives its hint from the population it is about to
/// hold and clamps to this, so a rebuild of a large vault is not sized for a
/// small one — `clear()` in particular runs on every model-version change, when
/// the index is about to be refilled to roughly its previous size.
const MIN_CAPACITY_HINT: usize = 1_000;

/// Live-key count up to which [`VectorIndex::search`] answers by exhaustive scan
/// instead of by graph traversal, trading the graph's ~6.7% recall loss (see
/// [`VectorIndex::exact_search`]) for a linear scan.
///
/// Held at 4096 deliberately. Raising it to cover a realistic block index
/// (~50k keys) was measured and rejected: `exact_search_scan_cost` puts a
/// 50k x 384 scan at ~19ms per query even after the cheaper distance function,
/// which is far too slow to sit in front of every search. At 4096 the same scan
/// is ~1ms. Block search above this size therefore still rides the lossy graph
/// — a known gap, not an oversight.
const EXACT_SEARCH_MAX_POINTS: usize = 4096;

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

/// A vector is usable only if every component is finite *and* at least one is
/// non-zero. Non-finite components poison neighbour selection for every query,
/// not just their own; an all-zero row is worse, because `DistCosine` scores it
/// 0.0 — nearest — against every query, so it would rank first everywhere.
/// `normalize_rows` zeroes a degenerate row rather than emitting NaN, which is
/// right for the graph but makes this check the one that has to catch it.
pub(crate) fn is_usable_vector(vector: &[f32]) -> bool {
    !vector.is_empty()
        && vector.iter().all(|x| x.is_finite())
        && vector.iter().any(|x| *x != 0.0)
}

fn new_graph(capacity_hint: usize) -> Hnsw<'static, f32, DistCosine> {
    Hnsw::new(
        MAX_NB_CONNECTION,
        capacity_hint.max(MIN_CAPACITY_HINT),
        NB_LAYER,
        EF_CONSTRUCTION,
        DistCosine,
    )
}

impl VectorIndex {
    pub fn new(dims: usize) -> Self {
        Self {
            dims,
            hnsw: new_graph(0),
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
                    if is_usable_vector(&vec) {
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
                    if is_usable_vector(&vec) {
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
        if !is_usable_vector(&vector) {
            log::warn!(
                "VectorIndex::insert: dropping {str_key} — vector is empty, non-finite, or all-zero"
            );
            return;
        }

        if self.key_to_id.is_empty() && vector.len() != self.dims {
            self.dims = vector.len();
            self.hnsw = new_graph(0);
            self.id_to_key.clear();
            self.next_id = 0;
        }

        if vector.len() != self.dims {
            log::warn!(
                "VectorIndex::insert: dropping {} — vector has {} dims, index has {}",
                str_key,
                vector.len(),
                self.dims
            );
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
        // A clear is almost always followed by a refill of comparable size (it
        // runs on every model-version change), so the pre-clear population is
        // the best capacity hint available.
        self.hnsw = new_graph(self.key_to_id.len());
        self.key_to_id.clear();
        self.id_to_key.clear();
        self.vectors.clear();
        self.next_id = 0;
        self.dirty = true;
    }

    pub fn search(&self, query: &[f32], limit: usize) -> Vec<(String, f32)> {
        if self.key_to_id.is_empty() {
            return vec![];
        }
        if query.len() != self.dims {
            log::warn!(
                "VectorIndex::search: query has {} dims, index has {} — returning no hits",
                query.len(),
                self.dims
            );
            return vec![];
        }

        if self.key_to_id.len() <= EXACT_SEARCH_MAX_POINTS {
            if self.vectors.len() == self.key_to_id.len() {
                return self.exact_search(query, limit);
            }
            // Silently reverting here is the difference between an exact answer
            // and a ~6.7%-lossy one, so it must be visible when it happens.
            log::debug!(
                "VectorIndex::search: {} vectors for {} keys — falling back to the graph path",
                self.vectors.len(),
                self.key_to_id.len()
            );
        }

        self.graph_search(query, limit)
    }

    /// Approximate nearest neighbours by graph traversal. Used above
    /// [`EXACT_SEARCH_MAX_POINTS`], where an exhaustive scan is too slow —
    /// at the cost of the recall loss [`Self::exact_search`] documents.
    fn graph_search(&self, query: &[f32], limit: usize) -> Vec<(String, f32)> {
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

    /// Exhaustive nearest-neighbour scan over the resident vectors.
    ///
    /// `hnsw_rs` 0.3.4 files a reverse neighbour link at the *inserted point's*
    /// own level rather than at the layer the forward link was made on
    /// (`hnsw.rs:1245`), so a point drawn onto level >= 1 can end up with no
    /// layer-0 in-edge and become unreachable from the layer-0 traversal every
    /// query terminates in — losing ~6.7% of points per build for small graphs,
    /// and leaving a just-inserted point invisible to every other note. There is
    /// no fixed release upstream (0.3.4 is the newest), so small indexes bypass
    /// the graph entirely; the cost is negligible below
    /// [`EXACT_SEARCH_MAX_POINTS`] and the answer is exact rather than
    /// approximate.
    ///
    /// Every ingested vector is L2-normalized (`normalize_rows` and
    /// `mean_pool_normalize` are the only producers, and `is_usable_vector`
    /// rejects the degenerate rows they can emit), so `1 - dot` equals
    /// `DistCosine` on this data and results stay on the same scale as the
    /// traversal path they replace. It is several times cheaper: `DistCosine`'s
    /// f32 path runs three f64 accumulators and a `sqrt` per vector, two of
    /// which are pure waste once the norms are known to be 1.
    fn exact_search(&self, query: &[f32], limit: usize) -> Vec<(String, f32)> {
        // Keys stay borrowed through scoring and selection; only the `limit`
        // that survive are ever cloned. The old version allocated a `String`
        // per vector per query.
        let mut scored: Vec<(f32, &str)> = self
            .vectors
            .iter()
            .map(|(key, vector)| (super::vector_db::dot_distance(query, vector), key.as_str()))
            .collect();

        // `total_cmp` gives a total order without a NaN-capable comparison, and
        // the key tie-break keeps the answer independent of `HashMap` iteration
        // order — without it two indexes holding identical vectors could rank
        // tied entries differently. Because the order is total, selecting the
        // `limit` smallest and sorting only those yields exactly what sorting
        // everything would have.
        let rank =
            |a: &(f32, &str), b: &(f32, &str)| a.0.total_cmp(&b.0).then_with(|| a.1.cmp(b.1));
        let limit = limit.min(scored.len());
        if limit < scored.len() {
            scored.select_nth_unstable_by(limit, rank);
            scored.truncate(limit);
        }
        scored.sort_unstable_by(rank);
        scored
            .into_iter()
            .map(|(distance, key)| (key.to_string(), distance))
            .collect()
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

        self.hnsw = new_graph(old_vectors.len());
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

    /// Persists the built graph (`<basename>-<gen>.hnsw.graph` + `.hnsw.data`)
    /// plus a companion `<basename>.hnsw.meta` holding our side maps. The graph
    /// is written under a fresh generation basename and the meta (which names
    /// that generation) is renamed into place last, so a kill mid-dump leaves
    /// the previous meta→graph pairing intact instead of pairing a new graph
    /// with old `d_id` mappings. `load_from_dump` only opens the graph files the
    /// meta names, falling back to rebuild if they are missing. Superseded
    /// generations are pruned after the swap.
    pub fn dump(&self, dir: &Path, basename: &str, model_version: &str) -> anyhow::Result<()> {
        std::fs::create_dir_all(dir)?;
        let generation = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let graph_basename = self.hnsw.file_dump(dir, &format!("{basename}-{generation}"))?;

        let meta = IndexMeta {
            format_version: META_FORMAT_VERSION,
            model_version: model_version.to_string(),
            dims: self.dims,
            next_id: self.next_id,
            graph_basename: graph_basename.clone(),
            id_to_key: self.id_to_key.iter().map(|(k, v)| (*k, v.clone())).collect(),
        };

        let meta_path = dir.join(format!("{basename}.hnsw.meta"));
        let tmp_path = dir.join(format!("{basename}.hnsw.meta.tmp"));
        std::fs::write(&tmp_path, serde_json::to_vec(&meta)?)?;
        std::fs::rename(&tmp_path, &meta_path)?;
        Self::prune_stale_graph_files(dir, basename, &graph_basename);
        Ok(())
    }

    /// Removes graph/data files of older generations (including pre-generation
    /// `<basename>.hnsw.*` dumps) once the meta points at `keep`. Best-effort:
    /// leftovers from a crash here are cleaned by the next dump.
    fn prune_stale_graph_files(dir: &Path, basename: &str, keep: &str) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let Some(name) = name.to_str() else {
                continue;
            };
            if !name.ends_with(".hnsw.graph") && !name.ends_with(".hnsw.data") {
                continue;
            }
            let ours = name.starts_with(&format!("{basename}-"))
                || name.starts_with(&format!("{basename}."));
            if ours && !name.starts_with(&format!("{keep}.")) {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    /// Loads a previously dumped graph if the companion meta matches the
    /// expected model/layout. Returns `None` (never an error) on any mismatch
    /// or missing/corrupt file, so the caller falls back to a clean rebuild.
    /// The reloaded index recovers its `vectors` map from the graph points, so
    /// it answers searches identically to the index it was dumped from; call
    /// [`Self::reconcile_from_sqlite`] to apply deltas taken since the dump.
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

        let mut id_to_key: HashMap<usize, String> = meta.id_to_key.into_iter().collect();

        // Recover `vectors` from the graph points rather than leaving the index
        // half-initialised until `reconcile_from_sqlite` runs: `search` selects
        // its exact path on `vectors` being complete, so a bare load would
        // otherwise answer differently from the index that produced the dump.
        // Points whose id no longer maps to a key are stale and stay dropped.
        // A dump persists whatever was in the graph, so a vector that predates
        // the ingest guard — or was corrupted on disk — arrives here unchecked
        // and would otherwise feed `exact_search` directly. Unusable points are
        // unmapped as well as skipped, so the graph path filters them out too.
        let mut vectors: HashMap<String, Vec<f32>> = HashMap::with_capacity(id_to_key.len());
        let mut rejected: Vec<usize> = Vec::new();
        if hnsw.get_point_indexation().get_nb_point() > 0 {
            for point in hnsw.get_point_indexation().into_iter() {
                let id = point.get_origin_id();
                let Some(key) = id_to_key.get(&id) else {
                    continue;
                };
                let vector = point.get_v();
                if is_usable_vector(vector) {
                    vectors.insert(key.clone(), vector.to_vec());
                } else {
                    log::warn!("VectorIndex::load_from_dump({basename}): dropping unusable {key}");
                    rejected.push(id);
                }
            }
        }
        for id in rejected {
            id_to_key.remove(&id);
        }

        let key_to_id: HashMap<String, usize> =
            id_to_key.iter().map(|(id, key)| (key.clone(), *id)).collect();

        Some(Self {
            dims: meta.dims,
            hnsw,
            key_to_id,
            id_to_key,
            vectors,
            next_id: meta.next_id,
            dirty: false,
        })
    }

    /// Repopulates the `vectors` map from SQLite and applies any deltas since the
    /// dump: inserts keys new to the graph, re-inserts keys whose vector changed
    /// (marking the old graph point stale), removes loaded keys no longer in
    /// SQLite. Makes a slightly-stale dump correct and restores `get_vector` /
    /// `compact_from_vectors`. Only flips `dirty` when a delta is applied.
    pub fn reconcile_from_sqlite(&mut self, conn: &rusqlite::Connection, index_name: &str) {
        let mut sqlite_vecs: HashMap<String, Vec<f32>> = HashMap::new();
        Self::for_each_embedding(conn, index_name, |key, vec| {
            sqlite_vecs.insert(key, vec);
        });

        // Graph points own the vectors used for search ranking, and SQLite is
        // updated on every save while the graph is only dumped on settle. A key
        // whose SQLite vector no longer matches its graph point (crash between
        // save and dump) must be re-inserted, not just refreshed in `vectors`.
        // `hnsw_rs` panics on an `Option::unwrap` when its point indexation is
        // iterated while empty, so an index reconciled before anything was ever
        // inserted (an empty dump reloaded, or a first-run rebuild) must not
        // enter the loop. `load_from_dump` already guards its own iteration.
        let mut changed: HashSet<String> = HashSet::new();
        if self.hnsw.get_point_indexation().get_nb_point() > 0 {
            for point in self.hnsw.get_point_indexation().into_iter() {
                if let Some(key) = self.id_to_key.get(&point.get_origin_id()) {
                    if let Some(vec) = sqlite_vecs.get(key) {
                        if point.get_v() != vec.as_slice() {
                            changed.insert(key.clone());
                        }
                    }
                }
            }
        }

        let removed: Vec<String> = self
            .key_to_id
            .keys()
            .filter(|k| !sqlite_vecs.contains_key(*k))
            .cloned()
            .collect();
        for key in removed {
            self.remove(&key);
        }

        for (key, vec) in sqlite_vecs {
            if self.key_to_id.contains_key(&key) && !changed.contains(&key) {
                self.vectors.insert(key, vec);
            } else {
                self.insert(&key, vec);
            }
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
            None => Self::rebuild_from_sqlite(conn, index_name, expected_dims),
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
        // An integral seed maps every component to zero, which `insert` now
        // rejects. Fail loudly here rather than let a caller silently index one
        // vector fewer than it thinks.
        assert!(is_usable_vector(&v), "degenerate seed {seed}");
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

    /// Layer assignment is random per insert, so `hnsw_rs`'s misfiled reverse
    /// links strand a point in only ~6.7% of builds. A single build would
    /// therefore pass by luck; 250 builds put a false pass near 1e-8. Vectors
    /// are deliberately non-collinear, matching real embeddings.
    const RECALL_TRIALS: usize = 250;

    #[test]
    fn small_index_returns_every_live_vector() {
        for trial in 0..RECALL_TRIALS {
            for n in 2..=4usize {
                let mut idx = VectorIndex::new(8);
                let vectors: Vec<Vec<f32>> = (0..n)
                    .map(|i| unit_vec(0.1 + 0.23 * i as f32, 8))
                    .collect();
                for (i, vector) in vectors.iter().enumerate() {
                    idx.insert(&format!("k{i}"), vector.clone());
                }

                for (i, vector) in vectors.iter().enumerate() {
                    let results = idx.search(vector, n);
                    assert_eq!(results.len(), n, "trial {trial}, n={n}, query k{i}");
                    assert_eq!(results[0].0, format!("k{i}"), "trial {trial}, n={n}");
                }
            }
        }
    }

    #[test]
    fn newly_inserted_vector_is_immediately_findable() {
        // The last-inserted point is the one the graph can never heal: no later
        // insert exists to hand it a layer-0 in-edge. This is the shipped
        // symptom — a just-saved note missing from every other note's neighbours.
        for trial in 0..RECALL_TRIALS {
            let mut idx = VectorIndex::new(8);
            for i in 0..16 {
                idx.insert(&format!("k{i}"), unit_vec(0.031 * (i as f32 + 1.0), 8));
            }
            let probe = idx.get_vector("k0").unwrap().clone();
            idx.insert("fresh", unit_vec(0.7315, 8));

            let hits = idx.search(&probe, 17);
            assert_eq!(hits.len(), 17, "trial {trial}");
            assert!(hits.iter().any(|(k, _)| k == "fresh"), "trial {trial}");
        }
    }

    #[test]
    fn search_matches_bruteforce_top_k() {
        let mut idx = VectorIndex::new(8);
        let vectors: Vec<Vec<f32>> = (0..32)
            .map(|i| unit_vec(0.03 * (i as f32 + 1.0), 8))
            .collect();
        for (i, vector) in vectors.iter().enumerate() {
            idx.insert(&format!("k{i}"), vector.clone());
        }
        let query = unit_vec(0.415, 8);

        let mut expected: Vec<(String, f32)> = vectors
            .iter()
            .enumerate()
            .map(|(i, vector)| {
                (
                    format!("k{i}"),
                    super::super::vector_db::dot_distance(&query, vector),
                )
            })
            .collect();
        expected.sort_by(|a, b| a.1.total_cmp(&b.1).then_with(|| a.0.cmp(&b.0)));
        expected.truncate(5);

        assert_eq!(idx.search(&query, 5), expected);
    }

    /// An index crossing [`EXACT_SEARCH_MAX_POINTS`] silently switches which
    /// path answers it, so the two must rank the same vectors the same way and
    /// score them on the same scale. The exact path uses `1 - dot` rather than
    /// the graph's `DistCosine`; that substitution is only sound because every
    /// resident vector is L2-normalized, and this is the test that holds it.
    #[test]
    fn exact_and_graph_paths_agree() {
        let mut idx = VectorIndex::new(8);
        // The seed must be large enough that `% 1.0` wraps within the 8
        // components; a small one yields a scalar multiple of the same ramp for
        // every i, which normalizes to one direction and makes the whole index
        // a single tie.
        let vectors: Vec<Vec<f32>> = (0..48)
            .map(|i| unit_vec(0.37 * (i as f32 + 1.0), 8))
            .collect();
        for (i, vector) in vectors.iter().enumerate() {
            idx.insert(&format!("k{i}"), vector.clone());
        }

        for probe in [0usize, 17, 47] {
            let query = &vectors[probe];
            let exact = idx.exact_search(query, 5);
            let graph = idx.graph_search(query, 5);

            assert_eq!(exact.len(), 5);
            assert_eq!(graph.len(), 5);
            // Only the exact path is guaranteed to find the query's own vector:
            // a point stranded by the misfiled reverse links is unreachable from
            // the layer-0 traversal, which is the whole reason this path exists.
            assert_eq!(exact[0].0, format!("k{probe}"));
            // Both paths must be ordered by ascending distance.
            for hits in [&exact, &graph] {
                assert!(hits.windows(2).all(|w| w[0].1 <= w[1].1));
            }

            // Same pair, same distance, whichever path produced it.
            let exact_by_key: HashMap<&str, f32> =
                exact.iter().map(|(k, d)| (k.as_str(), *d)).collect();
            for (key, graph_distance) in &graph {
                if let Some(exact_distance) = exact_by_key.get(key.as_str()) {
                    assert!(
                        (exact_distance - graph_distance).abs() < 1e-5,
                        "{key}: exact {exact_distance} vs graph {graph_distance}"
                    );
                }
            }
        }
    }

    #[test]
    fn tied_distances_order_deterministically() {
        // Three keys holding the same vector tie exactly. Without the key
        // tie-break their order would follow `HashMap` iteration order, so two
        // indexes with identical contents could answer differently — which is
        // what `dump_load_roundtrip_preserves_graph_and_mapping` compares.
        let query = unit_vec(0.37, 8);
        let twin = unit_vec(0.61, 8);
        let build = |order: [&str; 3]| {
            let mut idx = VectorIndex::new(8);
            for key in order {
                idx.insert(key, twin.clone());
            }
            idx.search(&query, 3)
        };

        let first = build(["a_twin", "b_twin", "c_twin"]);
        let second = build(["c_twin", "b_twin", "a_twin"]);

        assert_eq!(first, second);
        assert_eq!(first[0].0, "a_twin");
        assert_eq!(first[1].0, "b_twin");
        assert_eq!(first[2].0, "c_twin");
    }

    /// The tie-break must survive the bounded-top-k selection, which only sorts
    /// the retained prefix: a `limit` shorter than the tied run is exactly where
    /// a partial selection could return a different member of the tie.
    #[test]
    fn tie_break_survives_truncation_to_limit() {
        let query = unit_vec(0.37, 8);
        let twin = unit_vec(0.61, 8);
        let build = |order: [&str; 4]| {
            let mut idx = VectorIndex::new(8);
            for key in order {
                idx.insert(key, twin.clone());
            }
            idx.search(&query, 2)
        };

        let first = build(["a", "b", "c", "d"]);
        assert_eq!(first, build(["d", "c", "b", "a"]));
        assert_eq!(first.len(), 2);
        assert_eq!(first[0].0, "a");
        assert_eq!(first[1].0, "b");
    }

    /// Not a gate — a measurement, and the evidence for where
    /// [`EXACT_SEARCH_MAX_POINTS`] is set. Run with:
    /// `cargo test --release exact_search_scan_cost -- --ignored --nocapture`
    /// Compares the shipped scan against the shape it replaced (`DistCosine`
    /// plus a full sort) at a realistic block-index size.
    #[test]
    #[ignore]
    fn exact_search_scan_cost() {
        use hnsw_rs::anndists::dist::Distance;

        const DIMS: usize = 384;
        const POINTS: usize = 50_000;
        const QUERIES: usize = 20;

        // Spread over the whole sphere rather than the positive orthant, so the
        // scan sees the distance distribution real embeddings produce.
        let spread = |i: usize| -> Vec<f32> {
            let mut v: Vec<f32> = (0..DIMS)
                .map(|d| (((i * 7919 + d * 104729) % 1000) as f32 / 1000.0) - 0.5)
                .collect();
            let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
            v.iter_mut().for_each(|x| *x /= norm);
            assert!(is_usable_vector(&v));
            v
        };

        let mut idx = VectorIndex::new(DIMS);
        for i in 0..POINTS {
            idx.insert(&format!("note{i}.md\0h{i}"), spread(i));
        }
        let queries: Vec<Vec<f32>> = (0..QUERIES).map(|i| spread(POINTS + i * 31)).collect();

        let baseline = |query: &[f32], limit: usize| -> Vec<(String, f32)> {
            let mut scored: Vec<(String, f32)> = idx
                .vectors
                .iter()
                .map(|(key, vector)| (key.clone(), DistCosine.eval(query, vector)))
                .collect();
            scored.sort_by(|a, b| a.1.total_cmp(&b.1).then_with(|| a.0.cmp(&b.0)));
            scored.truncate(limit);
            scored
        };

        for query in &queries {
            std::hint::black_box(baseline(query, 20));
            std::hint::black_box(idx.exact_search(query, 20));
        }

        let start = std::time::Instant::now();
        for query in &queries {
            std::hint::black_box(baseline(query, 20));
        }
        let before = start.elapsed().as_secs_f64() * 1000.0 / QUERIES as f64;

        let start = std::time::Instant::now();
        for query in &queries {
            std::hint::black_box(idx.exact_search(query, 20));
        }
        let after = start.elapsed().as_secs_f64() * 1000.0 / QUERIES as f64;

        println!(
            "exact_search over {POINTS} x {DIMS}: before {before:.2}ms/query, after {after:.2}ms/query"
        );

        // Rankings must agree: the cheaper distance is only valid because every
        // resident vector is L2-normalized.
        let keys = |hits: Vec<(String, f32)>| -> Vec<String> {
            hits.into_iter().map(|(k, _)| k).collect()
        };
        for query in &queries {
            assert_eq!(keys(baseline(query, 20)), keys(idx.exact_search(query, 20)));
        }
    }

    #[test]
    fn non_finite_and_all_zero_vectors_are_rejected() {
        let mut idx = VectorIndex::new(8);
        idx.insert("live", unit_vec(0.3, 8));

        idx.insert("nan", vec![f32::NAN; 8]);
        idx.insert("inf", vec![f32::INFINITY; 8]);
        // `normalize_rows` zeroes a degenerate row rather than emitting NaN, and
        // `DistCosine` scores a zero vector 0.0 — nearest — against every query,
        // so an accepted zero row would rank first for every search.
        idx.insert("zero", vec![0.0; 8]);

        assert_eq!(idx.len(), 1);
        for key in ["nan", "inf", "zero"] {
            assert!(idx.get_vector(key).is_none(), "{key} must not be resident");
        }
        let hits = idx.search(&unit_vec(0.9, 8), 10);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].0, "live");
    }

    #[test]
    fn load_from_dump_drops_unusable_vectors() {
        // A dump made before the ingest guard (or corrupted on disk) must not
        // reintroduce a vector that `insert` would reject today.
        let dir = scratch_dir("unusable-dump");
        let mut idx = VectorIndex::new(8);
        idx.insert("good", unit_vec(0.2, 8));

        // Bypass `insert`'s guard the way a graph built before it would have:
        // a NaN point in the graph with a live key mapping, which the dump then
        // persists verbatim.
        let bad = vec![f32::NAN; 8];
        let bad_id = idx.next_id;
        idx.next_id += 1;
        idx.hnsw.insert((&bad, bad_id));
        idx.key_to_id.insert("bad".to_string(), bad_id);
        idx.id_to_key.insert(bad_id, "bad".to_string());
        idx.vectors.insert("bad".to_string(), bad);
        idx.dump(&dir, "notes-test", "m1").unwrap();

        let loaded = VectorIndex::load_from_dump(&dir, "notes-test", "m1", 8).unwrap();

        assert!(loaded.get_vector("good").is_some());
        assert!(loaded.get_vector("bad").is_none());
        assert_eq!(loaded.len(), 1, "the unusable key is unmapped, not just skipped");
        assert!(loaded
            .search(&unit_vec(0.2, 8), 10)
            .iter()
            .all(|(key, d)| key == "good" && d.is_finite()));
    }

    #[test]
    fn search_excludes_removed_and_overwritten_entries() {
        let mut idx = VectorIndex::new(8);
        for i in 0..10 {
            idx.insert(&format!("k{i}"), unit_vec(0.07 * (i as f32 + 1.0), 8));
        }
        for i in 0..4 {
            idx.remove(&format!("k{i}"));
        }
        for i in 4..6 {
            idx.insert(&format!("k{i}"), unit_vec(0.31 * (i as f32 + 1.0), 8));
        }

        let hits = idx.search(&unit_vec(0.07, 8), 10);

        assert_eq!(hits.len(), 6);
        assert!(hits
            .iter()
            .all(|(k, _)| !["k0", "k1", "k2", "k3"].contains(&k.as_str())));
        assert_eq!(idx.stale_count(), 6);
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
            idx.insert(&format!("k{i}"), unit_vec(0.003 * (i as f32 + 1.0), 8));
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
            idx.insert(&format!("k{i}"), unit_vec(0.003 * (i as f32 + 1.0), 8));
        }
        for i in 0..25 {
            idx.remove(&format!("k{i}"));
        }

        idx.compact_from_vectors();
        assert_eq!(idx.len(), 25);
        assert_eq!(idx.stale_count(), 0);
        // Verify we can still search
        let v = unit_vec(0.003 * 26.0, 8);
        let results = idx.search(&v, 5);
        assert!(!results.is_empty());
    }

    #[test]
    fn compact_if_stale_compacts_only_past_threshold() {
        let mut idx = VectorIndex::new(8);
        for i in 0..200 {
            idx.insert(&format!("k{i}"), unit_vec(0.003 * (i as f32 + 1.0), 8));
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
        let v = unit_vec(0.003 * 151.0, 8);
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

    fn graph_files(dir: &Path) -> Vec<std::path::PathBuf> {
        std::fs::read_dir(dir)
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.to_string_lossy().ends_with(".hnsw.graph"))
            .collect()
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
            idx.insert(&format!("k{i}"), unit_vec(0.07 * (i as f32 + 1.0), 8));
        }
        let query = unit_vec(0.07 * 4.0, 8);
        let before = idx.search(&query, 5);

        idx.dump(&dir, "notes-test", "m1").unwrap();
        let loaded = VectorIndex::load_from_dump(&dir, "notes-test", "m1", 8).unwrap();

        assert_eq!(loaded.len(), idx.len());
        let after = loaded.search(&query, 5);
        assert_eq!(before, after);
    }

    #[test]
    fn loaded_dump_has_complete_vectors() {
        // A load that left `vectors` empty would silently route searches down a
        // different path than the index it was dumped from.
        let dir = scratch_dir("loaded-vectors");
        let mut idx = VectorIndex::new(8);
        for i in 0..12 {
            idx.insert(&format!("k{i}"), unit_vec(0.07 * (i as f32 + 1.0), 8));
        }
        idx.dump(&dir, "notes-test", "m1").unwrap();

        let loaded = VectorIndex::load_from_dump(&dir, "notes-test", "m1", 8).unwrap();

        for i in 0..12 {
            let key = format!("k{i}");
            assert_eq!(loaded.get_vector(&key), idx.get_vector(&key), "{key}");
        }
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
        std::fs::remove_file(&graph_files(&dir)[0]).unwrap();
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
        std::fs::write(&graph_files(&dir)[0], b"garbage").unwrap();

        let rebuilt = VectorIndex::load_or_rebuild(&conn, "notes", 8, &dir, "notes-test", "m1");

        assert_eq!(rebuilt.len(), 1);
        assert!(rebuilt.is_dirty());
        assert!(rebuilt.search(&va, 1).iter().any(|(k, _)| k == "a"));
    }

    #[test]
    fn reconcile_reinserts_changed_vectors() {
        let dir = scratch_dir("reconcile-changed");
        let va_old = unit_vec(0.1, 8);
        let va_new = unit_vec(0.9, 8);
        let mut idx = VectorIndex::new(8);
        idx.insert("a", va_old);
        idx.dump(&dir, "notes-test", "m1").unwrap();

        // SQLite was updated after the dump (save without settle, then crash).
        let conn = mem_conn(&[("a", va_new.clone())]);
        let mut loaded = VectorIndex::load_from_dump(&dir, "notes-test", "m1", 8).unwrap();
        loaded.reconcile_from_sqlite(&conn, "notes");

        assert_eq!(loaded.get_vector("a"), Some(&va_new));
        assert_eq!(loaded.len(), 1);
        // Search must rank by the fresh vector, not the dumped pre-edit point.
        let hits = loaded.search(&va_new, 5);
        assert_eq!(hits[0].0, "a");
        assert!(hits[0].1 < 1e-5);
        // The healed graph must be persisted on the next settle.
        assert!(loaded.is_dirty());
    }

    #[test]
    fn dump_prunes_superseded_generations() {
        let dir = scratch_dir("prune");
        let mut idx = VectorIndex::new(8);
        idx.insert("a", unit_vec(0.1, 8));
        idx.dump(&dir, "notes-test", "m1").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(2));
        idx.insert("b", unit_vec(0.4, 8));
        idx.dump(&dir, "notes-test", "m1").unwrap();

        assert_eq!(graph_files(&dir).len(), 1);
        let loaded = VectorIndex::load_from_dump(&dir, "notes-test", "m1", 8).unwrap();
        assert_eq!(loaded.len(), 2);
    }

    #[test]
    fn crash_between_graph_dump_and_meta_keeps_previous_pairing() {
        let dir = scratch_dir("crash-window");
        let va = unit_vec(0.1, 8);
        let vb = unit_vec(0.4, 8);
        let mut idx = VectorIndex::new(8);
        idx.insert("a", va.clone());
        idx.insert("b", vb.clone());
        idx.dump(&dir, "notes-test", "m1").unwrap();

        // Simulate a kill after the graph hits disk but before the meta rename:
        // a permuted (compacted) graph lands under a newer generation basename
        // while the meta still names the old generation.
        let mut permuted = VectorIndex::new(8);
        permuted.insert("b", vb);
        permuted.insert("a", va.clone());
        permuted
            .hnsw
            .file_dump(&dir, "notes-test-99999999999999")
            .unwrap();

        // Load must pair the old meta with the old graph, never the new one.
        let loaded = VectorIndex::load_from_dump(&dir, "notes-test", "m1", 8).unwrap();
        let hits = loaded.search(&va, 1);
        assert_eq!(hits[0].0, "a");
    }
}
