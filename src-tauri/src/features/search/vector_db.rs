use rusqlite::{params, Connection};
use std::path::Path;

pub const MODEL_VERSION: &str = "bge-small-en-v1.5-q";
pub const EMBEDDING_DIMS: usize = 384;

pub fn load_sqlite_vec_extension(conn: &Connection, ext_path: &Path) -> Result<(), String> {
    unsafe {
        let _guard = conn
            .load_extension_enable()
            .map_err(|e| format!("Failed to enable extension loading: {e}"))?;
        conn.load_extension(ext_path, None)
            .map_err(|e| format!("Failed to load sqlite-vec extension: {e}"))?;
    }
    Ok(())
}

pub fn init_vector_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS note_embeddings USING vec0(
            path TEXT PRIMARY KEY,
            embedding float[384]
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
    conn.execute(
        "DELETE FROM note_embeddings WHERE path = ?1",
        params![path],
    )
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
    let bytes = floats_to_bytes(query_vec);
    let mut stmt = conn
        .prepare(
            "SELECT path, distance FROM note_embeddings
             WHERE embedding MATCH ?1
             ORDER BY distance ASC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![bytes, limit as i64], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f32>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

pub fn get_embedding(conn: &Connection, path: &str) -> Option<Vec<f32>> {
    let bytes: Vec<u8> = conn
        .query_row(
            "SELECT embedding FROM note_embeddings WHERE path = ?1",
            params![path],
            |row| row.get(0),
        )
        .ok()?;
    let floats: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect();
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

fn floats_to_bytes(floats: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(floats.len() * 4);
    for f in floats {
        bytes.extend_from_slice(&f.to_le_bytes());
    }
    bytes
}

