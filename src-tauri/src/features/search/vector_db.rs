use rusqlite::{params, Connection};
use std::collections::{HashMap, HashSet};

pub const MODEL_VERSION: &str = "snowflake-arctic-embed-xs";
pub const _EMBEDDING_DIMS: usize = 384;

pub fn init_vector_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS note_embeddings (
            path TEXT PRIMARY KEY,
            embedding BLOB NOT NULL
        );

        CREATE TABLE IF NOT EXISTS block_embeddings (
            path TEXT NOT NULL,
            heading_id TEXT NOT NULL,
            embedding BLOB NOT NULL,
            PRIMARY KEY (path, heading_id)
        );

        CREATE TABLE IF NOT EXISTS embedding_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

",
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR IGNORE INTO embedding_meta (key, value) VALUES ('model_version', ?1)",
        params![MODEL_VERSION],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR IGNORE INTO embedding_meta (key, value) VALUES ('dimensions', '384')",
        [],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn upsert_embedding(conn: &Connection, path: &str, embedding: &[f32]) -> Result<(), String> {
    let bytes = floats_to_bytes(embedding);
    conn.execute(
        "INSERT OR REPLACE INTO note_embeddings (path, embedding) VALUES (?1, ?2)",
        params![path, bytes],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn remove_embedding(conn: &Connection, path: &str) -> Result<(), String> {
    conn.execute("DELETE FROM note_embeddings WHERE path = ?1", params![path])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn remove_embeddings_by_prefix(conn: &Connection, prefix: &str) -> Result<(), String> {
    let escaped = prefix
        .replace('\\', r"\\")
        .replace('%', r"\%")
        .replace('_', r"\_");
    let pattern = format!("{escaped}%");
    conn.execute(
        "DELETE FROM note_embeddings WHERE path LIKE ?1 ESCAPE '\\'",
        params![pattern],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn rename_embedding_path(
    conn: &Connection,
    old_path: &str,
    new_path: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE note_embeddings SET path = ?1 WHERE path = ?2",
        params![new_path, old_path],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn rename_embeddings_by_prefix(
    conn: &Connection,
    old_prefix: &str,
    new_prefix: &str,
) -> Result<(), String> {
    let escaped = old_prefix
        .replace('\\', r"\\")
        .replace('%', r"\%")
        .replace('_', r"\_");
    let pattern = format!("{escaped}%");
    let old_len = old_prefix.len() as i64;
    conn.execute(
        "UPDATE note_embeddings SET path = ?1 || substr(path, ?2 + 1) WHERE path LIKE ?3 ESCAPE '\\'",
        params![new_prefix, old_len, pattern],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn knn_search(
    conn: &Connection,
    query_vec: &[f32],
    limit: usize,
) -> Result<Vec<(String, f32)>, String> {
    let mut stmt = conn
        .prepare("SELECT path, embedding FROM note_embeddings")
        .map_err(|e| e.to_string())?;

    let mut scored: Vec<(String, f32)> = stmt
        .query_map([], |row| {
            let path: String = row.get(0)?;
            let blob: Vec<u8> = row.get(1)?;
            Ok((path, blob))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .map(|(path, blob)| {
            let vec = bytes_to_floats(&blob);
            let dist = dot_distance(query_vec, &vec);
            (path, dist)
        })
        .collect();

    scored.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);
    Ok(scored)
}

pub fn knn_search_batch(
    conn: &Connection,
    paths: &[String],
    limit: usize,
    distance_threshold: f32,
    linked_sets: &std::collections::HashMap<String, std::collections::HashSet<String>>,
) -> Result<Vec<(String, String, f32)>, String> {
    let mut stmt = conn
        .prepare("SELECT path, embedding FROM note_embeddings")
        .map_err(|e| e.to_string())?;

    let embedding_map: std::collections::HashMap<String, Vec<f32>> = stmt
        .query_map([], |row| {
            let path: String = row.get(0)?;
            let blob: Vec<u8> = row.get(1)?;
            Ok((path, blob))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .map(|(path, blob)| {
            let vec = bytes_to_floats(&blob);
            (path, vec)
        })
        .collect();

    let path_set: std::collections::HashSet<&str> = paths.iter().map(|s| s.as_str()).collect();
    let mut seen = std::collections::HashSet::new();
    let mut edges = Vec::new();

    for query_path in paths {
        let query_vec = match embedding_map.get(query_path.as_str()) {
            Some(v) => v,
            None => continue,
        };

        let empty_set = std::collections::HashSet::new();
        let linked = linked_sets.get(query_path.as_str()).unwrap_or(&empty_set);

        let mut scored: Vec<(&str, f32)> = embedding_map
            .iter()
            .filter(|(p, _)| p.as_str() != query_path.as_str() && !linked.contains(p.as_str()))
            .map(|(p, v)| (p.as_str(), dot_distance(query_vec, v)))
            .filter(|(_, d)| *d < distance_threshold)
            .collect();

        scored.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
        scored.truncate(limit);

        for (target, distance) in scored {
            if !path_set.contains(target) {
                continue;
            }
            let key = if query_path.as_str() < target {
                (query_path.as_str(), target)
            } else {
                (target, query_path.as_str())
            };
            let key_string = format!("{}|{}", key.0, key.1);
            if seen.contains(&key_string) {
                continue;
            }
            seen.insert(key_string);
            edges.push((query_path.clone(), target.to_string(), distance));
        }
    }

    Ok(edges)
}

// --- Block embeddings (section-level) ---

pub fn upsert_block_embedding(
    conn: &Connection,
    path: &str,
    heading_id: &str,
    embedding: &[f32],
) -> Result<(), String> {
    let bytes = floats_to_bytes(embedding);
    conn.execute(
        "INSERT OR REPLACE INTO block_embeddings (path, heading_id, embedding) VALUES (?1, ?2, ?3)",
        params![path, heading_id, bytes],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn remove_block_embeddings(conn: &Connection, path: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM block_embeddings WHERE path = ?1",
        params![path],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn remove_block_embeddings_by_prefix(conn: &Connection, prefix: &str) -> Result<(), String> {
    let escaped = prefix
        .replace('\\', r"\\")
        .replace('%', r"\%")
        .replace('_', r"\_");
    let pattern = format!("{escaped}%");
    conn.execute(
        "DELETE FROM block_embeddings WHERE path LIKE ?1 ESCAPE '\\'",
        params![pattern],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn rename_block_embedding_path(
    conn: &Connection,
    old_path: &str,
    new_path: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE block_embeddings SET path = ?1 WHERE path = ?2",
        params![new_path, old_path],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn rename_block_embeddings_by_prefix(
    conn: &Connection,
    old_prefix: &str,
    new_prefix: &str,
) -> Result<(), String> {
    let escaped = old_prefix
        .replace('\\', r"\\")
        .replace('%', r"\%")
        .replace('_', r"\_");
    let pattern = format!("{escaped}%");
    let old_len = old_prefix.len() as i64;
    conn.execute(
        "UPDATE block_embeddings SET path = ?1 || substr(path, ?2 + 1) WHERE path LIKE ?3 ESCAPE '\\'",
        params![new_prefix, old_len, pattern],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_block_embeddings_for_note(conn: &Connection, path: &str) -> Vec<(String, Vec<f32>)> {
    let mut stmt =
        match conn.prepare("SELECT heading_id, embedding FROM block_embeddings WHERE path = ?1") {
            Ok(s) => s,
            Err(_) => return vec![],
        };
    let rows = match stmt.query_map(params![path], |row| {
        let heading_id: String = row.get(0)?;
        let blob: Vec<u8> = row.get(1)?;
        Ok((heading_id, blob))
    }) {
        Ok(r) => r,
        Err(_) => return vec![],
    };
    rows.filter_map(|r| r.ok())
        .map(|(heading_id, blob)| (heading_id, bytes_to_floats(&blob)))
        .filter(|(_, vec)| !vec.is_empty())
        .collect()
}

pub fn get_block_embeddings_for_notes(
    conn: &Connection,
    paths: &[&str],
) -> HashMap<String, Vec<(String, Vec<f32>)>> {
    if paths.is_empty() {
        return HashMap::new();
    }
    let placeholders: Vec<&str> = paths.iter().map(|_| "?").collect();
    let sql = format!(
        "SELECT path, heading_id, embedding FROM block_embeddings WHERE path IN ({})",
        placeholders.join(",")
    );
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return HashMap::new(),
    };
    let params: Vec<&dyn rusqlite::types::ToSql> = paths
        .iter()
        .map(|p| p as &dyn rusqlite::types::ToSql)
        .collect();
    let rows = match stmt.query_map(params.as_slice(), |row| {
        let path: String = row.get(0)?;
        let heading_id: String = row.get(1)?;
        let blob: Vec<u8> = row.get(2)?;
        Ok((path, heading_id, blob))
    }) {
        Ok(r) => r,
        Err(_) => return HashMap::new(),
    };
    let mut map: HashMap<String, Vec<(String, Vec<f32>)>> = HashMap::new();
    for row in rows.flatten() {
        let vec = bytes_to_floats(&row.2);
        if !vec.is_empty() {
            map.entry(row.0).or_default().push((row.1, vec));
        }
    }
    map
}

pub fn get_block_embedded_keys(conn: &Connection) -> HashSet<String> {
    let mut stmt = match conn.prepare("SELECT path, heading_id FROM block_embeddings") {
        Ok(s) => s,
        Err(e) => {
            log::warn!("get_block_embedded_keys: prepare failed: {e}");
            return HashSet::new();
        }
    };
    let rows = match stmt.query_map([], |row| {
        let path: String = row.get(0)?;
        let heading_id: String = row.get(1)?;
        Ok(format!("{path}\0{heading_id}"))
    }) {
        Ok(r) => r,
        Err(e) => {
            log::warn!("get_block_embedded_keys: query failed: {e}");
            return HashSet::new();
        }
    };
    rows.filter_map(|r| r.ok()).collect()
}

pub fn get_block_embedding_count(conn: &Connection) -> usize {
    conn.query_row("SELECT COUNT(*) FROM block_embeddings", [], |row| {
        row.get::<_, i64>(0)
    })
    .unwrap_or(0) as usize
}

pub fn clear_all_block_embeddings(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM block_embeddings", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_embedding(conn: &Connection, path: &str) -> Option<Vec<f32>> {
    let bytes: Vec<u8> = conn
        .query_row(
            "SELECT embedding FROM note_embeddings WHERE path = ?1",
            params![path],
            |row| row.get(0),
        )
        .ok()?;
    let floats = bytes_to_floats(&bytes);
    if floats.is_empty() {
        None
    } else {
        Some(floats)
    }
}

pub fn has_embedding(conn: &Connection, path: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM note_embeddings WHERE path = ?1",
        params![path],
        |_| Ok(()),
    )
    .is_ok()
}

pub fn get_embedded_paths(conn: &Connection) -> HashSet<String> {
    let mut stmt = match conn.prepare("SELECT path FROM note_embeddings") {
        Ok(s) => s,
        Err(e) => {
            log::warn!("get_embedded_paths: prepare failed: {e}");
            return HashSet::new();
        }
    };
    let rows = match stmt.query_map([], |row| row.get::<_, String>(0)) {
        Ok(r) => r,
        Err(e) => {
            log::warn!("get_embedded_paths: query failed: {e}");
            return HashSet::new();
        }
    };
    rows.filter_map(|r| r.ok()).collect()
}

pub fn get_embedding_count(conn: &Connection) -> usize {
    conn.query_row("SELECT COUNT(*) FROM note_embeddings", [], |row| {
        row.get::<_, i64>(0)
    })
    .unwrap_or(0) as usize
}

pub fn get_model_version(conn: &Connection) -> Option<String> {
    conn.query_row(
        "SELECT value FROM embedding_meta WHERE key = 'model_version'",
        [],
        |row| row.get(0),
    )
    .ok()
}

pub fn clear_all_embeddings(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM note_embeddings", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM block_embeddings", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_model_version(conn: &Connection, version: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO embedding_meta (key, value) VALUES ('model_version', ?1)",
        params![version],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn dot_distance(a: &[f32], b: &[f32]) -> f32 {
    let mut dot = 0.0f32;
    for (x, y) in a.iter().zip(b.iter()) {
        dot += x * y;
    }
    1.0 - dot
}

fn floats_to_bytes(floats: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(floats.len() * 4);
    for f in floats {
        bytes.extend_from_slice(&f.to_le_bytes());
    }
    bytes
}

pub(crate) fn bytes_to_floats(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db");
        init_vector_schema(&conn).expect("schema");
        conn
    }

    fn fake_embedding(seed: f32) -> Vec<f32> {
        let mut v: Vec<f32> = (0..384).map(|i| (i as f32 * seed) % 1.0).collect();
        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            v.iter_mut().for_each(|x| *x /= norm);
        }
        v
    }

    #[test]
    fn block_embeddings_table_created() {
        let conn = setup();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='block_embeddings'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn upsert_and_count_block_embeddings() {
        let conn = setup();
        let emb = fake_embedding(0.1);
        upsert_block_embedding(&conn, "note.md", "h-1-intro-0", &emb).unwrap();
        upsert_block_embedding(&conn, "note.md", "h-2-details-0", &emb).unwrap();
        assert_eq!(get_block_embedding_count(&conn), 2);
    }

    #[test]
    fn remove_block_embeddings_by_path() {
        let conn = setup();
        let emb = fake_embedding(0.2);
        upsert_block_embedding(&conn, "a.md", "h-1-a-0", &emb).unwrap();
        upsert_block_embedding(&conn, "a.md", "h-2-b-0", &emb).unwrap();
        upsert_block_embedding(&conn, "b.md", "h-1-c-0", &emb).unwrap();
        remove_block_embeddings(&conn, "a.md").unwrap();
        assert_eq!(get_block_embedding_count(&conn), 1);
    }

    #[test]
    fn rename_block_embedding_path_works() {
        let conn = setup();
        let emb = fake_embedding(0.3);
        upsert_block_embedding(&conn, "old.md", "h-1-x-0", &emb).unwrap();
        rename_block_embedding_path(&conn, "old.md", "new.md").unwrap();
        let keys = get_block_embedded_keys(&conn);
        assert!(keys.contains("new.md\0h-1-x-0"));
        assert!(!keys.contains("old.md\0h-1-x-0"));
    }

    #[test]
    fn clear_all_embeddings_clears_blocks_too() {
        let conn = setup();
        let emb = fake_embedding(0.5);
        upsert_embedding(&conn, "note.md", &emb).unwrap();
        upsert_block_embedding(&conn, "note.md", "h-1-x-0", &emb).unwrap();
        clear_all_embeddings(&conn).unwrap();
        assert_eq!(get_embedding_count(&conn), 0);
        assert_eq!(get_block_embedding_count(&conn), 0);
    }

    #[test]
    fn get_block_embeddings_for_note_returns_matching_blocks() {
        let conn = setup();
        let emb_a = fake_embedding(0.1);
        let emb_b = fake_embedding(0.2);
        upsert_block_embedding(&conn, "note.md", "h-1-intro-0", &emb_a).unwrap();
        upsert_block_embedding(&conn, "note.md", "h-2-details-0", &emb_b).unwrap();
        upsert_block_embedding(&conn, "other.md", "h-1-x-0", &emb_a).unwrap();

        let blocks = get_block_embeddings_for_note(&conn, "note.md");
        assert_eq!(blocks.len(), 2);
        let ids: Vec<&str> = blocks.iter().map(|(id, _)| id.as_str()).collect();
        assert!(ids.contains(&"h-1-intro-0"));
        assert!(ids.contains(&"h-2-details-0"));
    }

    #[test]
    fn upsert_block_embedding_overwrite_then_remove() {
        let conn = setup();
        let emb_a = fake_embedding(0.1);
        let emb_c = fake_embedding(0.3);
        upsert_block_embedding(&conn, "note.md", "h-a", &emb_a).unwrap();
        upsert_block_embedding(&conn, "note.md", "h-b", &emb_a).unwrap();
        remove_block_embeddings(&conn, "note.md").unwrap();
        upsert_block_embedding(&conn, "note.md", "h-a", &emb_a).unwrap();
        upsert_block_embedding(&conn, "note.md", "h-c", &emb_c).unwrap();
        let blocks = get_block_embeddings_for_note(&conn, "note.md");
        assert_eq!(blocks.len(), 2);
        let ids: Vec<&str> = blocks.iter().map(|(id, _)| id.as_str()).collect();
        assert!(ids.contains(&"h-a"));
        assert!(ids.contains(&"h-c"));
        assert!(!ids.contains(&"h-b"));
    }

    #[test]
    fn get_block_embeddings_for_note_returns_empty_for_missing() {
        let conn = setup();
        let blocks = get_block_embeddings_for_note(&conn, "nonexistent.md");
        assert!(blocks.is_empty());
    }

    #[test]
    fn two_tier_block_search_finds_similar() {
        let conn = setup();
        let emb_a = fake_embedding(0.1);
        let emb_b = fake_embedding(0.11);
        let emb_c = fake_embedding(0.9);
        // Note-level embeddings
        upsert_embedding(&conn, "src.md", &emb_a).unwrap();
        upsert_embedding(&conn, "close.md", &emb_b).unwrap();
        upsert_embedding(&conn, "far.md", &emb_c).unwrap();
        // Block-level embeddings
        upsert_block_embedding(&conn, "src.md", "h-1", &emb_a).unwrap();
        upsert_block_embedding(&conn, "close.md", "h-1", &emb_b).unwrap();
        upsert_block_embedding(&conn, "far.md", "h-1", &emb_c).unwrap();
        // Note-level KNN should return close.md as candidate
        let candidates = knn_search(&conn, &emb_a, 50).unwrap();
        let candidate_paths: Vec<&str> = candidates.iter().map(|(p, _)| p.as_str()).collect();
        assert!(candidate_paths.contains(&"close.md"));
        // Block-level pairwise should find close.md more similar
        let close_blocks = get_block_embeddings_for_note(&conn, "close.md");
        let src_blocks = get_block_embeddings_for_note(&conn, "src.md");
        let sim_close = 1.0 - dot_distance(&src_blocks[0].1, &close_blocks[0].1);
        let far_blocks = get_block_embeddings_for_note(&conn, "far.md");
        let sim_far = 1.0 - dot_distance(&src_blocks[0].1, &far_blocks[0].1);
        assert!(sim_close > sim_far, "close should be more similar than far");
    }

    #[test]
    fn two_tier_block_search_excludes_self() {
        let conn = setup();
        let emb = fake_embedding(0.1);
        upsert_embedding(&conn, "self.md", &emb).unwrap();
        upsert_block_embedding(&conn, "self.md", "h-1", &emb).unwrap();
        let results = knn_search(&conn, &emb, 50).unwrap();
        // Filter as the two-tier algorithm does
        let filtered: Vec<_> = results.iter().filter(|(p, _)| p != "self.md").collect();
        // Self should be in raw results but filtered out
        assert!(results.iter().any(|(p, _)| p == "self.md"));
        assert!(filtered.iter().all(|(p, _)| p != "self.md"));
    }

    #[test]
    fn two_tier_fallback_when_no_note_embedding() {
        let conn = setup();
        let emb_a = fake_embedding(0.1);
        let emb_b = fake_embedding(0.2);
        // Only block embeddings, no note-level embedding for src
        upsert_block_embedding(&conn, "src.md", "h-1", &emb_a).unwrap();
        upsert_block_embedding(&conn, "other.md", "h-1", &emb_b).unwrap();
        // get_embedding should return None for src
        assert!(get_embedding(&conn, "src.md").is_none());
        // Fallback: query distinct paths from block_embeddings
        let mut stmt = conn
            .prepare("SELECT DISTINCT path FROM block_embeddings WHERE path != ?1")
            .unwrap();
        let fallback_paths: Vec<String> = stmt
            .query_map(["src.md"], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert_eq!(fallback_paths, vec!["other.md"]);
    }

    #[test]
    fn get_block_embedded_keys_returns_composite_keys() {
        let conn = setup();
        let emb = fake_embedding(0.4);
        upsert_block_embedding(&conn, "x.md", "h-1-a-0", &emb).unwrap();
        upsert_block_embedding(&conn, "y.md", "h-2-b-0", &emb).unwrap();
        let keys = get_block_embedded_keys(&conn);
        assert_eq!(keys.len(), 2);
        assert!(keys.contains("x.md\0h-1-a-0"));
        assert!(keys.contains("y.md\0h-2-b-0"));
    }
}
