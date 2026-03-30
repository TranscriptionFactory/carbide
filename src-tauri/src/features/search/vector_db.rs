use rusqlite::{params, Connection};
use std::collections::HashSet;

pub const MODEL_VERSION: &str = "snowflake-arctic-embed-xs";
pub const _EMBEDDING_DIMS: usize = 384;

pub fn init_vector_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS note_embeddings (
            path TEXT PRIMARY KEY,
            embedding BLOB NOT NULL
        );

        CREATE TABLE IF NOT EXISTS embedding_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
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

fn dot_distance(a: &[f32], b: &[f32]) -> f32 {
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

fn bytes_to_floats(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect()
}
