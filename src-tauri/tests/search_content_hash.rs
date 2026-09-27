use crate::features::search::db::{open_search_db_at_path, sync_index_paths};
use crate::features::search::model::LinkedSourceMeta;
use crate::features::search::vector_db;
use rusqlite::{params, Connection};
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

const SOURCE: &str = "papers";
const ROOT: &str = "/refs";
const FILE: &str = "/refs/paper.pdf";

fn setup_db() -> (TempDir, Connection) {
    let tmp = TempDir::new().expect("temp dir");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db open");
    vector_db::init_vector_schema(&conn).expect("vector schema");
    (tmp, conn)
}

fn import(conn: &Connection, title: &str, body: &str, modified_at: u64) -> String {
    let (meta, _) = crate::features::search::db::upsert_linked_content(
        conn,
        SOURCE,
        ROOT,
        FILE,
        title,
        body,
        &[],
        "pdf",
        modified_at,
        &LinkedSourceMeta::default(),
    )
    .expect("linked upsert");
    meta.path
}

fn content_hash(conn: &Connection, path: &str) -> Option<String> {
    conn.query_row(
        "SELECT content_hash FROM notes WHERE path = ?1",
        params![path],
        |row| row.get::<_, Option<String>>(0),
    )
    .expect("notes row")
}

fn clear_content_hash(conn: &Connection, path: &str) {
    conn.execute(
        "UPDATE notes SET content_hash = NULL WHERE path = ?1",
        params![path],
    )
    .expect("clear hash");
}

fn seed_vector(conn: &Connection, path: &str) {
    vector_db::upsert_embedding(conn, path, &[0.1, 0.2]).expect("seed vector");
}

#[test]
fn first_write_records_a_hash() {
    let (_tmp, conn) = setup_db();
    let path = import(&conn, "Paper", "extracted text v1", 1_000);

    let hash = content_hash(&conn, &path).expect("hash written on first upsert");
    assert!(!hash.is_empty());
    assert_eq!(
        content_hash(&conn, &import(&conn, "Paper", "extracted text v1", 2_000)),
        Some(hash),
        "the hash is a function of the body alone"
    );
}

#[test]
fn changed_body_drops_the_note_vector() {
    let (_tmp, conn) = setup_db();
    let path = import(&conn, "Paper", "extracted text v1", 1_000);
    seed_vector(&conn, &path);
    let before = content_hash(&conn, &path);

    import(&conn, "Paper", "extracted text v2", 2_000);

    assert!(vector_db::get_embedding(&conn, &path).is_none());
    assert_ne!(content_hash(&conn, &path), before, "the new body's hash is stored");
}

#[test]
fn same_body_keeps_the_note_vector() {
    let (_tmp, conn) = setup_db();
    let path = import(&conn, "Paper", "extracted text v1", 1_000);
    seed_vector(&conn, &path);

    import(&conn, "Paper", "extracted text v1", 2_000);

    assert!(vector_db::get_embedding(&conn, &path).is_some());
}

#[test]
fn changed_title_with_same_body_drops_the_vector_without_changing_the_hash() {
    let (_tmp, conn) = setup_db();
    let path = import(&conn, "Paper", "extracted text v1", 1_000);
    seed_vector(&conn, &path);
    let before = content_hash(&conn, &path);

    import(&conn, "Renamed paper", "extracted text v1", 2_000);

    assert!(vector_db::get_embedding(&conn, &path).is_none());
    assert_eq!(content_hash(&conn, &path), before, "the body hash must not include the title");
}

#[test]
fn null_hash_with_changed_title_and_same_body_drops_the_vector() {
    let (_tmp, conn) = setup_db();
    let path = import(&conn, "Paper", "extracted text v1", 1_000);
    let before = content_hash(&conn, &path);
    clear_content_hash(&conn, &path);
    seed_vector(&conn, &path);

    import(&conn, "Renamed paper", "extracted text v1", 2_000);

    assert!(vector_db::get_embedding(&conn, &path).is_none());
    assert_eq!(content_hash(&conn, &path), before);
}

#[test]
fn null_hash_with_changed_body_drops_the_vector() {
    let (_tmp, conn) = setup_db();
    let path = import(&conn, "Paper", "extracted text v1", 1_000);
    clear_content_hash(&conn, &path);
    seed_vector(&conn, &path);

    import(&conn, "Paper", "extracted text v2", 2_000);

    assert!(
        vector_db::get_embedding(&conn, &path).is_none(),
        "a pre-upgrade row falls back to the stored FTS body to detect the change"
    );
    assert!(content_hash(&conn, &path).is_some());
}

#[test]
fn null_hash_with_same_body_keeps_the_vector_and_writes_the_hash() {
    let (_tmp, conn) = setup_db();
    let path = import(&conn, "Paper", "extracted text v1", 1_000);
    clear_content_hash(&conn, &path);
    seed_vector(&conn, &path);

    import(&conn, "Paper", "extracted text v1", 2_000);

    assert!(vector_db::get_embedding(&conn, &path).is_some());
    assert!(content_hash(&conn, &path).is_some());
}

fn sync_vault_file(conn: &Connection, root: &std::path::Path, rel: &str, body: &str) {
    std::fs::write(root.join(rel), body).expect("write vault file");
    sync_index_paths(
        None,
        "vault",
        conn,
        root,
        &AtomicBool::new(false),
        &|_, _| {},
        &mut || {},
        &[rel.to_string()],
        &[],
    )
    .expect("sync");
}

#[test]
fn vault_text_file_change_drops_the_note_vector() {
    let (tmp, conn) = setup_db();
    let root = tmp.path().join("vault");
    std::fs::create_dir_all(&root).expect("vault dir");
    sync_vault_file(&conn, &root, "notes.txt", "first draft");
    seed_vector(&conn, "notes.txt");

    sync_vault_file(&conn, &root, "notes.txt", "first draft");
    assert!(
        vector_db::get_embedding(&conn, "notes.txt").is_some(),
        "an unchanged body keeps its vector"
    );

    sync_vault_file(&conn, &root, "notes.txt", "second draft");
    assert!(vector_db::get_embedding(&conn, "notes.txt").is_none());
}
