use crate::features::search::hnsw_index::VectorIndex;
use crate::features::search::vector_db;
use rusqlite::Connection;

const NOTE: &str = "n.md";
const DIMS: usize = 8;

fn conn_with_vector_schema() -> Connection {
    let conn = Connection::open_in_memory().expect("in-memory db");
    vector_db::init_vector_schema(&conn).expect("vector schema");
    conn
}

fn good() -> Vec<f32> {
    let mut v = vec![0.0f32; DIMS];
    v[0] = 1.0;
    v
}

/// The two shapes that must never reach an index: a non-finite row, which
/// poisons neighbour selection for every query, and an all-zero row, which
/// `DistCosine` scores 0.0 — nearest — against every query and so would rank
/// first everywhere. `normalize_rows` emits the latter for a degenerate vector.
fn unusable() -> Vec<(&'static str, Vec<f32>)> {
    vec![
        ("nan", vec![f32::NAN; DIMS]),
        ("inf", vec![f32::INFINITY; DIMS]),
        ("neg_inf", vec![f32::NEG_INFINITY; DIMS]),
        ("zero", vec![0.0; DIMS]),
    ]
}

#[test]
fn upsert_embedding_rejects_unusable_vectors() {
    let conn = conn_with_vector_schema();

    for (label, vector) in unusable() {
        assert!(
            vector_db::upsert_embedding(&conn, NOTE, &vector).is_err(),
            "{label} must be refused"
        );
    }

    assert!(
        vector_db::get_embedded_paths(&conn).is_empty(),
        "no unusable row may be persisted"
    );
    vector_db::upsert_embedding(&conn, NOTE, &good()).expect("a usable vector is stored");
    assert_eq!(vector_db::get_embedded_paths(&conn).len(), 1);
}

#[test]
fn upsert_block_embedding_rejects_unusable_vectors() {
    let conn = conn_with_vector_schema();

    for (label, vector) in unusable() {
        assert!(
            vector_db::upsert_block_embedding(&conn, NOTE, "h1", &vector, "hash").is_err(),
            "{label} must be refused"
        );
    }

    assert!(vector_db::get_block_hashes(&conn, NOTE).is_empty());
    vector_db::upsert_block_embedding(&conn, NOTE, "h1", &good(), "hash")
        .expect("a usable vector is stored");
    assert_eq!(vector_db::get_block_hashes(&conn, NOTE).len(), 1);
}

#[test]
fn rebuild_skips_unusable_rows_already_on_disk() {
    // Rows written before the guard existed must not be reintroduced by a
    // rebuild, which reads SQLite directly rather than going through `upsert`.
    let conn = conn_with_vector_schema();
    vector_db::upsert_embedding(&conn, "good.md", &good()).expect("seed");
    for (label, vector) in unusable() {
        let bytes: Vec<u8> = vector.iter().flat_map(|f| f.to_le_bytes()).collect();
        conn.execute(
            "INSERT INTO note_embeddings (path, embedding) VALUES (?1, ?2)",
            rusqlite::params![format!("{label}.md"), bytes],
        )
        .expect("seed unusable row");
    }

    let idx = VectorIndex::rebuild_from_sqlite(&conn, "notes", DIMS);

    assert_eq!(idx.len(), 1, "only the usable row is indexed");
    assert!(idx.get_vector("good.md").is_some());
    assert!(idx.get_vector("zero.md").is_none());

    let hits = idx.search(&good(), 10);
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].0, "good.md");
}

#[test]
fn reconcile_skips_unusable_rows_already_on_disk() {
    let conn = conn_with_vector_schema();
    vector_db::upsert_embedding(&conn, "good.md", &good()).expect("seed");
    let bytes: Vec<u8> = vec![f32::NAN; DIMS]
        .iter()
        .flat_map(|f| f.to_le_bytes())
        .collect();
    conn.execute(
        "INSERT INTO note_embeddings (path, embedding) VALUES (?1, ?2)",
        rusqlite::params!["nan.md", bytes],
    )
    .expect("seed unusable row");

    let mut idx = VectorIndex::new(DIMS);
    idx.reconcile_from_sqlite(&conn, "notes");

    assert_eq!(idx.len(), 1);
    assert!(idx.get_vector("nan.md").is_none());
}

#[test]
fn block_rebuild_skips_unusable_rows_already_on_disk() {
    let conn = conn_with_vector_schema();
    vector_db::upsert_block_embedding(&conn, NOTE, "live", &good(), "hash").expect("seed");
    let bytes: Vec<u8> = vec![0.0f32; DIMS]
        .iter()
        .flat_map(|f| f.to_le_bytes())
        .collect();
    conn.execute(
        "INSERT INTO block_embeddings (path, heading_id, embedding, content_hash) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![NOTE, "degenerate", bytes, "hash"],
    )
    .expect("seed unusable row");

    let idx = VectorIndex::rebuild_from_sqlite(&conn, "blocks", DIMS);

    assert_eq!(idx.len(), 1);
    assert!(idx.get_vector(&format!("{NOTE}\0live")).is_some());
    assert!(idx.get_vector(&format!("{NOTE}\0degenerate")).is_none());
}
