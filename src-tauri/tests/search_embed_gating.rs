use crate::features::search::db as search_db;
use crate::features::search::hnsw_index::{SharedVectorIndex, VectorIndex};
use crate::features::search::service::{apply_note_embedding_on_save, embedding_flags};
use crate::features::search::vector_db;
use crate::features::settings::service::SettingsStore;
use rusqlite::Connection;
use serde_json::json;
use std::sync::{Arc, RwLock};

const NOTE: &str = "n.md";

fn conn_with_vector_schema() -> Connection {
    let conn = Connection::open_in_memory().expect("in-memory db");
    vector_db::init_vector_schema(&conn).expect("vector schema");
    conn
}

fn body(label: &str) -> String {
    (1..=10)
        .map(|i| format!("{label}-line-{i}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn note_markdown(alpha: &str, beta: &str) -> String {
    format!("# Alpha\n\n{}\n\n# Beta\n\n{}\n", body(alpha), body(beta))
}

fn shared_index() -> SharedVectorIndex {
    Arc::new(RwLock::new(VectorIndex::new(384)))
}

fn seed_embeddings(conn: &Connection, markdown: &str) {
    let hashes = search_db::embeddable_section_hashes(markdown);
    assert_eq!(hashes.len(), 2, "two embeddable sections expected");
    for (heading_id, hash) in &hashes {
        vector_db::upsert_block_embedding(conn, NOTE, heading_id, &[0.1_f32; 4], hash)
            .expect("seed block embedding");
    }
    vector_db::upsert_embedding(conn, NOTE, &[0.1_f32; 4]).expect("seed note embedding");
}

fn store_with_flags(note: bool, block: bool) -> SettingsStore {
    let mut store = SettingsStore::default();
    store
        .settings
        .insert("embedding_note_enabled".to_string(), json!(note));
    store
        .settings
        .insert("embedding_block_enabled".to_string(), json!(block));
    store
}

#[test]
fn embedding_flags_default_to_enabled() {
    assert_eq!(embedding_flags(&SettingsStore::default()), (true, true));
}

#[test]
fn embedding_flags_read_global_store_values() {
    assert_eq!(
        embedding_flags(&store_with_flags(false, false)),
        (false, false)
    );
    assert_eq!(
        embedding_flags(&store_with_flags(true, false)),
        (true, false)
    );
}

#[test]
fn disabled_flags_upsert_writes_no_embedding_rows() {
    let conn = conn_with_vector_schema();
    let markdown = note_markdown("a", "b");

    apply_note_embedding_on_save(
        &conn,
        NOTE,
        &markdown,
        &shared_index(),
        &shared_index(),
        false,
        false,
        None,
    );

    assert!(vector_db::get_block_hashes(&conn, NOTE).is_empty());
    assert!(vector_db::get_embedded_paths(&conn).is_empty());
}

#[test]
fn disabled_flags_still_invalidate_changed_sections() {
    let conn = conn_with_vector_schema();
    let v1 = note_markdown("a", "b");
    seed_embeddings(&conn, &v1);

    let v2 = note_markdown("a2", "b");
    apply_note_embedding_on_save(
        &conn,
        NOTE,
        &v2,
        &shared_index(),
        &shared_index(),
        false,
        false,
        None,
    );

    let v1_hashes = search_db::embeddable_section_hashes(&v1);
    let v2_hashes = search_db::embeddable_section_hashes(&v2);
    let changed: Vec<&String> = v1_hashes
        .iter()
        .filter(|(k, h)| v2_hashes.get(k.as_str()) != Some(h))
        .map(|(k, _)| k)
        .collect();
    assert_eq!(changed.len(), 1, "exactly one section changed");

    let remaining = vector_db::get_block_hashes(&conn, NOTE);
    assert!(!remaining.contains_key(changed[0]), "changed row dropped");
    assert_eq!(remaining.len(), 1, "unchanged section row survives");
    assert!(
        vector_db::get_embedded_paths(&conn).is_empty(),
        "stale note embedding removed"
    );
}

#[test]
fn model_unavailable_still_invalidates_changed_sections() {
    let conn = conn_with_vector_schema();
    let v1 = note_markdown("a", "b");
    seed_embeddings(&conn, &v1);

    let v2 = note_markdown("a2", "b");
    apply_note_embedding_on_save(
        &conn,
        NOTE,
        &v2,
        &shared_index(),
        &shared_index(),
        true,
        true,
        None,
    );

    let remaining = vector_db::get_block_hashes(&conn, NOTE);
    assert_eq!(remaining.len(), 1, "only unchanged section row survives");
    assert!(vector_db::get_embedded_paths(&conn).is_empty());
}

/// The save path skips embedding when the model is still loading, rather than
/// blocking the DB writer thread on a ~90 MB download. The skip is only safe
/// because the note's rows are invalidated regardless — but the note *key* used
/// to survive in `note_index`, so semantic and hybrid search kept returning the
/// pre-edit vector until a restart reconciled it.
#[test]
fn skip_path_save_drops_the_stale_note_key() {
    let conn = conn_with_vector_schema();
    let v1 = note_markdown("a", "b");
    seed_embeddings(&conn, &v1);

    let note_index = shared_index();
    {
        let mut ni = note_index.write().expect("index lock");
        ni.insert(NOTE, vec![0.1_f32; 4]);
        ni.insert("other.md", vec![0.2_f32; 4]);
    }

    let v2 = note_markdown("a2", "b");
    apply_note_embedding_on_save(
        &conn,
        NOTE,
        &v2,
        &note_index,
        &shared_index(),
        true,
        true,
        // No model: the load is in flight, so this save embeds nothing.
        None,
    );

    let ni = note_index.read().expect("index lock");
    assert!(
        ni.get_vector(NOTE).is_none(),
        "the pre-edit note vector must not stay live in the index"
    );
    assert!(
        ni.get_vector("other.md").is_some(),
        "unrelated notes are untouched"
    );
    assert!(
        vector_db::get_embedded_paths(&conn).is_empty(),
        "the DB row is gone too — index and DB agree"
    );
}

/// The counterpart: a save that changes nothing must not evict a live vector.
#[test]
fn unchanged_save_keeps_the_note_key() {
    let conn = conn_with_vector_schema();
    let markdown = note_markdown("a", "b");
    seed_embeddings(&conn, &markdown);

    let note_index = shared_index();
    note_index
        .write()
        .expect("index lock")
        .insert(NOTE, vec![0.1_f32; 4]);

    apply_note_embedding_on_save(
        &conn,
        NOTE,
        &markdown,
        &note_index,
        &shared_index(),
        true,
        true,
        None,
    );

    assert!(note_index
        .read()
        .expect("index lock")
        .get_vector(NOTE)
        .is_some());
    assert_eq!(vector_db::get_embedded_paths(&conn).len(), 1);
}

#[test]
fn save_prunes_stale_block_index_keys() {
    let conn = conn_with_vector_schema();
    let markdown = note_markdown("a", "b");
    let hashes = search_db::embeddable_section_hashes(&markdown);
    let block_index = shared_index();
    {
        let mut bi = block_index.write().expect("index lock");
        for heading_id in hashes.keys() {
            bi.insert(&format!("{NOTE}\0{heading_id}"), vec![0.1_f32; 384]);
        }
        bi.insert(&format!("{NOTE}\0removed-section"), vec![0.1_f32; 384]);
    }

    apply_note_embedding_on_save(
        &conn,
        NOTE,
        &markdown,
        &shared_index(),
        &block_index,
        false,
        false,
        None,
    );

    let bi = block_index.read().expect("index lock");
    let keys = bi.keys_with_prefix(&format!("{NOTE}\0"));
    assert_eq!(keys.len(), 2, "only live section keys survive");
    assert!(!keys.contains(&format!("{NOTE}\0removed-section")));
}
