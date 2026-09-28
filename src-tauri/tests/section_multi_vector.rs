use crate::features::search::db::{self, open_search_db_at_path, upsert_note};
use crate::features::search::hnsw_index::{SharedVectorIndex, VectorIndex};
use crate::features::search::model::{IndexNoteMeta, ScopeFilter};
use crate::features::search::service::{
    apply_note_embedding_on_save, missing_links_indexed, search_blocks_indexed,
    similar_blocks_indexed, prune_note_embedding_indices, publish_section_windows, SaveEncoder,
};
use crate::features::search::vector_db::{self, block_window_key, upsert_block_embeddings};
use rusqlite::Connection;
use std::collections::HashSet;
use std::sync::{Arc, RwLock};
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

fn db() -> (TempDir, Connection) {
    let tmp = TempDir::new().unwrap();
    let conn = open_search_db_at_path(&tmp.path().join("search.db")).unwrap();
    vector_db::init_vector_schema(&conn).unwrap();
    (tmp, conn)
}

fn markdown(long: bool) -> String {
    let body = "body words on a line\n".repeat(12);
    format!("# Alpha\n\n{}\n{}\n# Beta\n\n{}", if long { "LONG" } else { "short" }, body, body)
}

fn note(conn: &Connection, path: &str, body: &str) {
    let meta = IndexNoteMeta {
        id: path.into(),
        path: path.into(),
        title: "Alpha".into(),
        name: "name".into(),
        mtime_ms: 100,
        ctime_ms: 50,
        size_bytes: body.len() as i64,
        blurb: String::new(),
        file_type: None,
        source: None,
    };
    upsert_note(conn, &meta, body).unwrap();
}

fn indices() -> (SharedVectorIndex, SharedVectorIndex) {
    (
        Arc::new(RwLock::new(VectorIndex::new(2))),
        Arc::new(RwLock::new(VectorIndex::new(2))),
    )
}

struct Encoder;
impl SaveEncoder for Encoder {
    fn encode_sections(&self, texts: &[&str]) -> Result<Vec<Vec<Vec<f32>>>, String> {
        Ok(texts.iter().map(|text| {
            if text.contains("LONG") {
                vec![vec![1., 0.]; 3]
            } else {
                vec![vec![0., 1.]]
            }
        }).collect())
    }
    fn encode_note(&self, _: &str) -> Result<Vec<f32>, String> {
        panic!("sections must compose the note")
    }
}

fn save(
    conn: &Connection,
    body: &str,
    ni: &SharedVectorIndex,
    bi: &SharedVectorIndex,
    model: Option<&dyn SaveEncoder>,
) {
    apply_note_embedding_on_save(conn, "n.md", "Alpha", body, ni, bi, true, true, model);
}

#[test]
fn windows_persist_and_note_pooling_weights_every_window() {
    let (_tmp, conn) = db();
    let body = markdown(true);
    note(&conn, "n.md", &body);
    let (ni, bi) = indices();
    save(&conn, &body, &ni, &bi, Some(&Encoder));
    assert_eq!(vector_db::get_block_embedding_count(&conn), 4);
    assert_eq!(vector_db::get_block_embedded_keys(&conn).len(), 2);
    assert_eq!(bi.read().unwrap().len(), 4);
    let pooled = vector_db::get_embedding(&conn, "n.md").unwrap();
    let expected = vector_db::mean_pool_normalize(&[vec![1., 0.], vec![1., 0.], vec![1., 0.], vec![0., 1.]]);
    assert_eq!(pooled, expected);
    let restored = VectorIndex::rebuild_from_sqlite(&conn, "blocks", 2);
    assert_eq!(restored.len(), 4);
    for key in bi.read().unwrap().keys() {
        assert!(restored.get_vector(key).is_some(), "{key}");
    }
}

#[test]
fn shortening_removal_and_model_unavailability_clear_all_changed_windows() {
    let (_tmp, conn) = db();
    let long = markdown(true);
    note(&conn, "n.md", &long);
    let (ni, bi) = indices();
    save(&conn, &long, &ni, &bi, Some(&Encoder));
    let short = markdown(false);
    save(&conn, &short, &ni, &bi, None);
    assert_eq!(vector_db::get_block_embedding_count(&conn), 1, "unchanged Beta survives");
    assert_eq!(bi.read().unwrap().len(), 1);
    assert!(ni.read().unwrap().is_empty());
    save(&conn, &short, &ni, &bi, Some(&Encoder));
    assert_eq!(bi.read().unwrap().len(), 2, "old tail windows cannot survive shortening");
    save(&conn, "", &ni, &bi, None);
    assert_eq!(vector_db::get_block_embedding_count(&conn), 0);
    assert!(bi.read().unwrap().is_empty());
}

#[test]
fn section_write_failure_rolls_back_all_windows_inside_outer_transaction() {
    let (_tmp, conn) = db();
    conn.execute_batch("BEGIN; CREATE TRIGGER reject_second BEFORE INSERT ON block_embeddings WHEN NEW.window_index = 1 BEGIN SELECT RAISE(ABORT, 'storage failure'); END;").unwrap();
    assert!(upsert_block_embeddings(&conn, "n.md", "h", &[vec![1., 0.], vec![0., 1.]], "hash").is_err());
    assert!(vector_db::get_block_hashes(&conn, "n.md").is_empty());
    assert!(!conn.is_autocommit(), "outer transaction remains active");
    conn.execute_batch("DROP TRIGGER reject_second; COMMIT").unwrap();
    assert!(upsert_block_embeddings(&conn, "n.md", "h", &[vec![1., 0.], vec![f32::NAN, 0.]], "hash").is_err());
    assert!(vector_db::get_block_hashes(&conn, "n.md").is_empty());
}

#[test]
fn failed_save_cannot_publish_partial_windows_or_compose_partial_note() {
    let (_tmp, conn) = db();
    let body = markdown(true);
    note(&conn, "n.md", &body);
    conn.execute_batch("CREATE TRIGGER reject_second BEFORE INSERT ON block_embeddings WHEN NEW.window_index = 1 BEGIN SELECT RAISE(ABORT, 'storage failure'); END;").unwrap();
    let (ni, bi) = indices();
    save(&conn, &body, &ni, &bi, Some(&Encoder));
    assert_eq!(vector_db::get_block_embedding_count(&conn), 1);
    assert_eq!(bi.read().unwrap().len(), 1);
    assert!(ni.read().unwrap().is_empty());
    assert!(vector_db::get_embedding(&conn, "n.md").is_none());
}

#[test]
fn legacy_pooled_cache_migrates_without_claiming_window_zero() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("CREATE TABLE note_embeddings(path TEXT PRIMARY KEY, embedding BLOB NOT NULL);
        CREATE TABLE block_embeddings(path TEXT NOT NULL, heading_id TEXT NOT NULL, embedding BLOB NOT NULL, content_hash TEXT NOT NULL, PRIMARY KEY(path, heading_id));
        CREATE TABLE embedding_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO embedding_meta VALUES ('model_version', 'old-token');
        INSERT INTO note_embeddings VALUES ('n.md', X'0000803f00000000');
        INSERT INTO block_embeddings VALUES ('n.md', 'h', X'0000803f00000000', 'hash');").unwrap();
    assert!(!vector_db::vector_schema_initialized(&conn));
    vector_db::init_vector_schema(&conn).unwrap();
    assert!(vector_db::vector_schema_initialized(&conn));
    assert_eq!(vector_db::get_model_version(&conn).as_deref(), Some("old-token"));
    assert_eq!(vector_db::get_block_embedding_count(&conn), 0);
    assert_eq!(vector_db::get_embedding_count(&conn), 0);
    vector_db::init_vector_schema(&conn).unwrap();
}

fn seed_section(
    conn: &Connection,
    idx: &mut VectorIndex,
    path: &str,
    heading: &str,
    windows: &[Vec<f32>],
) {
    upsert_block_embeddings(conn, path, heading, windows, "hash").unwrap();
    for (i, vector) in windows.iter().enumerate() {
        idx.insert(&block_window_key(path, heading, i), vector.clone());
    }
}

#[test]
fn late_windows_deduplicate_before_limit_and_preserve_section_ranges_and_filters() {
    let (_tmp, conn) = db();
    let body = markdown(true);
    let mut idx = VectorIndex::new(2);
    for path in ["a.md", "b.md", "c.md"] {
        note(&conn, path, &body);
    }
    let section = db::get_embeddable_sections_for_note(&conn, "a.md", 1, 1).unwrap()[0].clone();
    let heading = &section.1;
    let mut windows = vec![vec![0., 1.]; 2];
    windows.extend(vec![vec![1., 0.]; 30]);
    seed_section(&conn, &mut idx, "a.md", heading, &windows);
    seed_section(&conn, &mut idx, "b.md", heading, &[vec![0.8, 0.6]]);
    seed_section(&conn, &mut idx, "c.md", heading, &[vec![0.6, 0.8]]);
    let hits = search_blocks_indexed(&conn, &idx, &[1., 0.], 3, None, None).unwrap();
    assert_eq!(hits.iter().map(|h| h.note.path.as_str()).collect::<Vec<_>>(), ["a.md", "b.md", "c.md"]);
    assert_eq!(hits[0].heading_id, *heading);
    assert_eq!((hits[0].start_line, hits[0].end_line), (section.2 as u32, section.3 as u32));
    assert_eq!(hits[0].distance, 0.);
    let scope = ScopeFilter { paths: vec!["b.md".into()], prefixes: vec![] };
    let scoped = search_blocks_indexed(&conn, &idx, &[1., 0.], 3, Some((100, 101)), Some(&scope)).unwrap();
    assert_eq!(scoped.len(), 1);
    assert_eq!(scoped[0].note.path, "b.md");
    assert!(search_blocks_indexed(&conn, &idx, &[1., 0.], 3, Some((101, 200)), None).unwrap().is_empty());
}

#[test]
fn similarity_and_missing_links_use_best_window_pair_without_leaking_window_ids() {
    let mut idx = VectorIndex::new(2);
    idx.insert(&block_window_key("source.md", "h", 0), vec![0., 1.]);
    idx.insert(&block_window_key("source.md", "h", 1), vec![1., 0.]);
    for i in 0..30 {
        idx.insert(&block_window_key("target.md", "late", i), vec![1., 0.]);
    }
    idx.insert(&block_window_key("other.md", "other", 0), vec![0.8, 0.6]);
    let similar = similar_blocks_indexed(&idx, "source.md", "h", 2);
    assert_eq!(similar.len(), 2);
    assert_eq!((&*similar[0].path, &*similar[0].heading_id, similar[0].distance), ("target.md", "late", 0.));
    let sections = vec![("source.md".into(), "h".into(), 3, 40)];
    let hits = missing_links_indexed(&idx, "source.md", &sections, &HashSet::new(), 2, 0.5);
    assert_eq!(hits.len(), 2);
    assert_eq!(hits[0].source_heading_id, "h");
    let linked = HashSet::from(["target.md".into()]);
    let filtered = missing_links_indexed(&idx, "source.md", &sections, &linked, 2, 0.5);
    assert_eq!(filtered.len(), 1);
}

#[test]
fn folder_and_unchanged_title_moves_rekey_windows_but_retitle_invalidates() {
    let (_tmp, conn) = db();
    let body = format!("---\ntitle: Title\n---\n{}", markdown(true));
    note(&conn, "folder/n.md", &body);
    let mut idx = VectorIndex::new(2);
    seed_section(&conn, &mut idx, "folder/n.md", "h", &[vec![1., 0.], vec![0., 1.]]);
    db::rename_folder_paths(&conn, "folder/", "moved/").unwrap();
    idx.rename_by_prefix("folder/", "moved/");
    assert_eq!(idx.keys_with_prefix("moved/n.md\0h\0").len(), 2);
    assert_eq!(vector_db::get_block_embeddings_for_note(&conn, "moved/n.md").len(), 2);
    assert!(!db::rename_note_path(&conn, "moved/n.md", "moved/renamed.md").unwrap());
    idx.rename_by_prefix("moved/n.md\0", "moved/renamed.md\0");
    assert_eq!(idx.keys_with_prefix("moved/renamed.md\0h\0").len(), 2);
    conn.execute("UPDATE notes SET title = 'renamed' WHERE path = 'moved/renamed.md'", []).unwrap();
    assert!(db::rename_note_path(&conn, "moved/renamed.md", "moved/new.md").unwrap());
    assert_eq!(vector_db::get_block_embedding_count(&conn), 0);
}

#[test]
fn every_source_window_contributes_its_best_sections_before_similarity_limit() {
    let mut idx = VectorIndex::new(3);
    idx.insert(&block_window_key("source.md", "h", 0), vec![1., 0., 0.]);
    idx.insert(&block_window_key("source.md", "h", 1), vec![0., 1., 0.]);
    for i in 0..30 {
        idx.insert(&block_window_key("a.md", "h", i), vec![1., 0., 0.]);
    }
    idx.insert(&block_window_key("b.md", "h", 0), vec![0.9, 0., 0.19_f32.sqrt()]);
    idx.insert(&block_window_key("c.md", "h", 0), vec![0., 0.8, 0.6]);
    idx.insert(&block_window_key("d.md", "h", 0), vec![0., 0.7, 0.51_f32.sqrt()]);
    let hits = similar_blocks_indexed(&idx, "source.md", "h", 2);
    assert_eq!(hits.iter().map(|h| h.path.as_str()).collect::<Vec<_>>(), ["a.md", "b.md"]);
}

#[test]
fn external_sync_prunes_changed_windows_before_model_load_and_bulk_publish_replaces_tail() {
    let (tmp, conn) = db();
    let long = format!("---\ntitle: Title\n---\n{}", markdown(true));
    let short = format!("---\ntitle: Title\n---\n{}", markdown(false));
    note(&conn, "n.md", &long);
    let (ni, bi) = indices();
    save(&conn, &long, &ni, &bi, Some(&Encoder));
    std::fs::write(tmp.path().join("n.md"), &short).unwrap();
    db::sync_index_paths(
        None,
        "vault",
        &conn,
        tmp.path(),
        &AtomicBool::new(false),
        &|_, _| {},
        &mut || {},
        &["n.md".into()],
        &[],
    ).unwrap();
    prune_note_embedding_indices(&conn, "n.md", &ni, &bi).unwrap();
    assert_eq!(vector_db::get_block_embedding_count(&conn), 1, "unchanged sibling persists");
    assert_eq!(bi.read().unwrap().len(), 1, "changed section loses all windows without model");
    assert!(ni.read().unwrap().is_empty());
    let heading = db::embeddable_sections(&short, "Alpha")[0].heading_id.clone();
    let mut index = bi.write().unwrap();
    index.insert(&block_window_key("n.md", &heading, 99), vec![1., 0.]);
    publish_section_windows(&mut index, "n.md", &heading, &[vec![1., 0.]]);
    assert_eq!(index.keys_with_prefix(&format!("n.md\0{heading}\0")).len(), 1);
    assert_eq!(index.len(), 2);
}
