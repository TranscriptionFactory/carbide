use hnsw_rs::anndists::dist::distances::DistCosine;
use hnsw_rs::hnsw::Hnsw;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

const MAX_NB_CONNECTION: usize = 16;
const NB_LAYER: usize = 16;
const EF_CONSTRUCTION: usize = 200;

pub type SharedVectorIndex = Arc<RwLock<VectorIndex>>;

pub struct VectorIndex {
    dims: usize,
    hnsw: Hnsw<'static, f32, DistCosine>,
    key_to_id: HashMap<String, usize>,
    id_to_key: HashMap<usize, String>,
    vectors: HashMap<String, Vec<f32>>,
    next_id: usize,
}

impl VectorIndex {
    pub fn new(dims: usize) -> Self {
        let hnsw = Hnsw::new(MAX_NB_CONNECTION, 10_000, NB_LAYER, EF_CONSTRUCTION, DistCosine);
        Self {
            dims,
            hnsw,
            key_to_id: HashMap::new(),
            id_to_key: HashMap::new(),
            vectors: HashMap::new(),
            next_id: 0,
        }
    }

    pub fn rebuild_from_sqlite(
        conn: &rusqlite::Connection,
        index_name: &str,
        dims: usize,
    ) -> Self {
        let mut idx = Self::new(dims);
        let start = std::time::Instant::now();

        match index_name {
            "notes" => {
                let mut stmt = match conn.prepare("SELECT path, embedding FROM note_embeddings") {
                    Ok(s) => s,
                    Err(e) => {
                        log::warn!("VectorIndex::rebuild_from_sqlite(notes): {e}");
                        return idx;
                    }
                };
                let rows = match stmt.query_map([], |row| {
                    let path: String = row.get(0)?;
                    let blob: Vec<u8> = row.get(1)?;
                    Ok((path, blob))
                }) {
                    Ok(r) => r,
                    Err(e) => {
                        log::warn!("VectorIndex::rebuild_from_sqlite(notes): {e}");
                        return idx;
                    }
                };
                for row in rows.flatten() {
                    let vec = super::vector_db::bytes_to_floats(&row.1);
                    if vec.len() == dims {
                        idx.insert(&row.0, vec);
                    }
                }
            }
            "blocks" => {
                let mut stmt = match conn
                    .prepare("SELECT path, heading_id, embedding FROM block_embeddings")
                {
                    Ok(s) => s,
                    Err(e) => {
                        log::warn!("VectorIndex::rebuild_from_sqlite(blocks): {e}");
                        return idx;
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
                        log::warn!("VectorIndex::rebuild_from_sqlite(blocks): {e}");
                        return idx;
                    }
                };
                for row in rows.flatten() {
                    let key = format!("{}\0{}", row.0, row.1);
                    let vec = super::vector_db::bytes_to_floats(&row.2);
                    if vec.len() == dims {
                        idx.insert(&key, vec);
                    }
                }
            }
            _ => {
                log::warn!("VectorIndex::rebuild_from_sqlite: unknown index_name={index_name}");
            }
        }

        let elapsed = start.elapsed();
        log::info!(
            "VectorIndex::rebuild_from_sqlite({index_name}): loaded {} vectors in {:.1}ms",
            idx.len(),
            elapsed.as_secs_f64() * 1000.0
        );

        idx
    }

    pub fn insert(&mut self, str_key: &str, vector: Vec<f32>) {
        if vector.len() != self.dims {
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
    }

    pub fn remove(&mut self, str_key: &str) {
        if let Some(id) = self.key_to_id.remove(str_key) {
            self.id_to_key.remove(&id);
            self.vectors.remove(str_key);
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
        self.hnsw = Hnsw::new(MAX_NB_CONNECTION, 10_000, NB_LAYER, EF_CONSTRUCTION, DistCosine);
        self.key_to_id.clear();
        self.id_to_key.clear();
        self.vectors.clear();
        self.next_id = 0;
    }

    pub fn search(&self, query: &[f32], limit: usize) -> Vec<(String, f32)> {
        if self.key_to_id.is_empty() || query.len() != self.dims {
            return vec![];
        }

        let ef_search = (limit * 2).max(32);
        // Over-fetch to account for stale entries
        let fetch = (limit + self.stale_count()).max(limit * 2);
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
        let old_vectors: Vec<(String, Vec<f32>)> = self
            .vectors
            .drain()
            .collect();

        self.hnsw = Hnsw::new(MAX_NB_CONNECTION, old_vectors.len().max(1000), NB_LAYER, EF_CONSTRUCTION, DistCosine);
        self.key_to_id.clear();
        self.id_to_key.clear();
        self.next_id = 0;

        for (key, vec) in old_vectors {
            self.insert(&key, vec);
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
        let v2 = unit_vec(0.9, 8);

        idx.insert("a", v1.clone());
        idx.insert("b", v2.clone());

        let results = idx.search(&v1, 2);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].0, "a");
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
}
