use crate::features::search::db as search_db;
use crate::features::search::embed_scope::{
    embedding_scope_from_editor, note_embed_eligible, EmbeddingScope, NoteEmbedFacts,
};
use crate::features::search::hnsw_index::{SharedVectorIndex, VectorIndex};
use crate::features::search::model::IndexNoteMeta;
use crate::features::search::service::{
    apply_note_embedding_on_save, block_embed_work_pending, embed_attempt_completed, embed_coverage,
    embedding_flags, embedding_scope_code, embedding_work_enabled, notes_pending_embedding,
    sweep_stale_note_vectors, SaveEncoder,
};
use crate::features::search::vector_db;
use crate::features::settings::service::SettingsStore;
use rusqlite::Connection;
use serde_json::json;
use std::collections::BTreeMap;
use std::sync::{Arc, RwLock};

const NOTE: &str = "n.md";

/// Encodes notes but never sections, so a save has to decide what to do with a
/// note whose changed blocks have no vectors.
struct SectionEncodeFails;

impl SaveEncoder for SectionEncodeFails {
    fn encode_sections(&self, _texts: &[&str]) -> Result<Vec<Vec<f32>>, String> {
        Err("encoder unavailable".to_string())
    }

    fn encode_note(&self, _text: &str) -> Result<Vec<f32>, String> {
        Ok(vec![0.5_f32; 4])
    }
}

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

/// The skip path's safety rests on the note being re-embedded later, which only
/// happens if its row is gone — the bulk pass skips anything already in
/// `note_embeddings`. Invalidation alone does not guarantee that: a note with no
/// embeddable sections compares `{} == {}`, so nothing is cleared. Such a note
/// saved while the model is loading would otherwise keep its pre-edit vector
/// forever, which is the common cold-start case (short and headingless notes).
#[test]
fn skip_path_clears_a_note_with_no_embeddable_sections() {
    let conn = conn_with_vector_schema();
    // Too short to qualify as an embeddable section, so `current_hashes` is
    // empty and matches the (also empty) stored set.
    let markdown = "just a sentence\n";
    assert!(
        search_db::embeddable_section_hashes(markdown).is_empty(),
        "fixture must have no embeddable sections"
    );
    vector_db::upsert_embedding(&conn, NOTE, &[0.1_f32; 4]).expect("seed note embedding");

    let note_index = shared_index();
    note_index
        .write()
        .expect("index lock")
        .insert(NOTE, vec![0.1_f32; 4]);

    apply_note_embedding_on_save(
        &conn,
        NOTE,
        markdown,
        &note_index,
        &shared_index(),
        true,
        true,
        None,
    );

    assert!(
        vector_db::get_embedded_paths(&conn).is_empty(),
        "row must be cleared so the bulk pass re-embeds the note"
    );
    assert!(note_index
        .read()
        .expect("index lock")
        .get_vector(NOTE)
        .is_none());
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

/// Block rows for the changed sections are deleted before the encode runs, so a
/// failed encode leaves the note with a *subset* of its blocks. Composing the
/// note vector from those survivors stored a partial vector and — because the
/// bulk pass is presence-based — marked the note embedded permanently.
#[test]
fn failed_block_encode_leaves_the_note_unembedded() {
    let conn = conn_with_vector_schema();
    let v1 = note_markdown("a", "b");
    seed_embeddings(&conn, &v1);

    let note_index = shared_index();
    note_index
        .write()
        .expect("index lock")
        .insert(NOTE, vec![0.1_f32; 4]);

    let v2 = note_markdown("a2", "b");
    apply_note_embedding_on_save(
        &conn,
        NOTE,
        &v2,
        &note_index,
        &shared_index(),
        true,
        true,
        Some(&SectionEncodeFails),
    );

    assert_eq!(
        vector_db::get_block_hashes(&conn, NOTE).len(),
        1,
        "the changed section's row is gone and was not re-encoded"
    );
    assert!(
        vector_db::get_embedded_paths(&conn).is_empty(),
        "no note vector composed from the surviving block, so the bulk pass re-picks the note"
    );
    assert!(
        note_index
            .read()
            .expect("index lock")
            .get_vector(NOTE)
            .is_none(),
        "the resident index agrees with the DB"
    );
}

/// The counterpart: nothing failed, so the note is composed and marked embedded.
#[test]
fn successful_block_encode_recomposes_the_note_vector() {
    struct Encoder;
    impl SaveEncoder for Encoder {
        fn encode_sections(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>, String> {
            Ok(texts.iter().map(|_| vec![0.5_f32; 4]).collect())
        }
        fn encode_note(&self, _text: &str) -> Result<Vec<f32>, String> {
            Err("the note has blocks to compose from".to_string())
        }
    }

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
        Some(&Encoder),
    );

    assert_eq!(vector_db::get_block_hashes(&conn, NOTE).len(), 2);
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

fn facts(file_type: Option<&str>, source: &str, char_count: i64) -> NoteEmbedFacts {
    NoteEmbedFacts {
        file_type: file_type.map(str::to_string),
        source: Some(source.to_string()),
        char_count,
    }
}

fn vault(file_type: &str) -> NoteEmbedFacts {
    facts(Some(file_type), "vault", 42)
}

const ALL_SCOPES: [EmbeddingScope; 3] = [
    EmbeddingScope::Markdown,
    EmbeddingScope::Documents,
    EmbeddingScope::All,
];

#[test]
fn scope_documents_is_the_default() {
    assert_eq!(embedding_scope_from_editor(None), EmbeddingScope::Documents);
    assert_eq!(
        embedding_scope_from_editor(Some(&json!({}))),
        EmbeddingScope::Documents
    );
    assert_eq!(
        embedding_scope_from_editor(Some(&json!({ "embedding_scope": "everything" }))),
        EmbeddingScope::Documents,
        "an unknown value from a hand-edited settings file falls back to the default"
    );
    assert_eq!(
        embedding_scope_from_editor(Some(&json!({ "embedding_scope": 3 }))),
        EmbeddingScope::Documents
    );
    assert_eq!(
        embedding_scope_from_editor(Some(&json!("documents"))),
        EmbeddingScope::Documents,
        "a non-object editor value is treated as missing"
    );
}

#[test]
fn scope_parses_each_value() {
    for (raw, expected) in [
        ("markdown", EmbeddingScope::Markdown),
        ("documents", EmbeddingScope::Documents),
        ("all", EmbeddingScope::All),
    ] {
        assert_eq!(
            embedding_scope_from_editor(Some(&json!({ "embedding_scope": raw }))),
            expected,
            "{raw}"
        );
    }
}

#[test]
fn eligibility_rejects_empty_body_in_every_scope() {
    for scope in ALL_SCOPES {
        for file_type in ["markdown", "canvas", "pdf", "text", "code"] {
            assert!(
                !note_embed_eligible(&facts(Some(file_type), "vault", 0), scope),
                "{file_type} with an empty body under {scope:?}"
            );
        }
        assert!(!note_embed_eligible(&facts(Some("pdf"), "linked", 0), scope));
    }
}

#[test]
fn eligibility_markdown_scope_excludes_documents_and_code() {
    let scope = EmbeddingScope::Markdown;
    assert!(note_embed_eligible(&vault("markdown"), scope));
    assert!(note_embed_eligible(&vault("canvas"), scope));
    for file_type in ["pdf", "html", "epub", "text", "code", "binary"] {
        assert!(!note_embed_eligible(&vault(file_type), scope), "{file_type}");
    }
    assert!(
        !note_embed_eligible(&facts(Some("pdf"), "linked", 42), scope),
        "linked rows are documents, so Markdown scope leaves them out"
    );
}

#[test]
fn eligibility_documents_scope_includes_linked_rows() {
    let scope = EmbeddingScope::Documents;
    for file_type in ["markdown", "canvas", "pdf", "html", "epub", "text"] {
        assert!(note_embed_eligible(&vault(file_type), scope), "{file_type}");
    }
    assert!(!note_embed_eligible(&vault("code"), scope));
    assert!(!note_embed_eligible(&vault("binary"), scope));
    assert!(note_embed_eligible(&facts(Some("pdf"), "linked", 42), scope));
    assert!(
        note_embed_eligible(&facts(Some("code"), "linked", 42), scope),
        "a linked row is eligible by its source, whatever its file_type"
    );
}

#[test]
fn eligibility_all_scope_includes_code_never_binary() {
    let scope = EmbeddingScope::All;
    for file_type in ["markdown", "canvas", "pdf", "html", "epub", "text", "code"] {
        assert!(note_embed_eligible(&vault(file_type), scope), "{file_type}");
    }
    assert!(!note_embed_eligible(&vault("binary"), scope));
    assert!(note_embed_eligible(&facts(Some("code"), "linked", 42), scope));
}

#[test]
fn eligibility_rejects_unknown_file_type() {
    for scope in ALL_SCOPES {
        assert!(!note_embed_eligible(&facts(None, "vault", 42), scope));
        assert!(!note_embed_eligible(&facts(Some("wasm"), "vault", 42), scope));
    }
}

fn seed_note_vector(conn: &Connection, note_index: &SharedVectorIndex, path: &str) {
    vector_db::upsert_embedding(conn, path, &[0.1_f32; 4]).expect("seed note embedding");
    note_index
        .write()
        .expect("index lock")
        .insert(path, vec![0.1_f32; 4]);
}

fn embedded_keys(note_index: &SharedVectorIndex) -> Vec<String> {
    let mut keys = note_index.read().expect("index lock").keys_with_prefix("");
    keys.sort();
    keys
}

#[test]
fn sweep_drops_ineligible_rows_from_db_and_index() {
    let conn = conn_with_vector_schema();
    let note_index = shared_index();
    for path in ["a.md", "b.py", "c.png"] {
        seed_note_vector(&conn, &note_index, path);
    }
    let facts: BTreeMap<String, NoteEmbedFacts> = [
        ("a.md".to_string(), vault("markdown")),
        ("b.py".to_string(), vault("code")),
        ("c.png".to_string(), facts(Some("binary"), "vault", 0)),
    ]
    .into_iter()
    .collect();

    let swept = sweep_stale_note_vectors(&conn, &note_index, &facts, EmbeddingScope::Documents);

    assert_eq!(swept, 2);
    let mut db_paths: Vec<String> = vector_db::get_embedded_paths(&conn).into_iter().collect();
    db_paths.sort();
    assert_eq!(db_paths, vec!["a.md".to_string()]);
    assert_eq!(embedded_keys(&note_index), vec!["a.md".to_string()]);
}

#[test]
fn sweep_drops_rows_with_no_note_facts() {
    let conn = conn_with_vector_schema();
    let note_index = shared_index();
    seed_note_vector(&conn, &note_index, "deleted.md");
    seed_note_vector(&conn, &note_index, "kept.md");
    let facts: BTreeMap<String, NoteEmbedFacts> =
        [("kept.md".to_string(), vault("markdown"))].into_iter().collect();

    let swept = sweep_stale_note_vectors(&conn, &note_index, &facts, EmbeddingScope::Documents);

    assert_eq!(swept, 1, "a vector whose notes row is gone is a ghost");
    assert!(!vector_db::has_embedding(&conn, "deleted.md"));
    assert_eq!(embedded_keys(&note_index), vec!["kept.md".to_string()]);
}

#[test]
fn sweep_drops_index_keys_without_a_db_row() {
    let conn = conn_with_vector_schema();
    let note_index = shared_index();
    seed_note_vector(&conn, &note_index, "kept.md");
    note_index
        .write()
        .expect("index lock")
        .insert("orphan.txt", vec![0.2_f32; 4]);
    let facts: BTreeMap<String, NoteEmbedFacts> = [
        ("kept.md".to_string(), vault("markdown")),
        ("orphan.txt".to_string(), vault("text")),
    ]
    .into_iter()
    .collect();

    let swept = sweep_stale_note_vectors(&conn, &note_index, &facts, EmbeddingScope::Documents);

    assert_eq!(swept, 1, "an index key with no DB row counts as swept");
    assert_eq!(embedded_keys(&note_index), vec!["kept.md".to_string()]);
    assert!(vector_db::has_embedding(&conn, "kept.md"));
}

#[test]
fn sweep_keeps_eligible_vectors() {
    let conn = conn_with_vector_schema();
    let note_index = shared_index();
    for path in ["a.md", "b.pdf", "linked/paper.pdf"] {
        seed_note_vector(&conn, &note_index, path);
    }
    let facts: BTreeMap<String, NoteEmbedFacts> = [
        ("a.md".to_string(), vault("markdown")),
        ("b.pdf".to_string(), vault("pdf")),
        (
            "linked/paper.pdf".to_string(),
            facts(Some("pdf"), "linked", 42),
        ),
    ]
    .into_iter()
    .collect();

    let swept = sweep_stale_note_vectors(&conn, &note_index, &facts, EmbeddingScope::Documents);

    assert_eq!(swept, 0);
    assert_eq!(vector_db::get_embedded_paths(&conn).len(), 3);
    assert_eq!(embedded_keys(&note_index).len(), 3);
}

#[test]
fn sweep_is_idempotent() {
    let conn = conn_with_vector_schema();
    let note_index = shared_index();
    seed_note_vector(&conn, &note_index, "a.md");
    seed_note_vector(&conn, &note_index, "b.py");
    let facts: BTreeMap<String, NoteEmbedFacts> = [
        ("a.md".to_string(), vault("markdown")),
        ("b.py".to_string(), vault("code")),
    ]
    .into_iter()
    .collect();

    let first = sweep_stale_note_vectors(&conn, &note_index, &facts, EmbeddingScope::Markdown);
    let second = sweep_stale_note_vectors(&conn, &note_index, &facts, EmbeddingScope::Markdown);

    assert_eq!((first, second), (1, 0));
    assert_eq!(embedded_keys(&note_index), vec!["a.md".to_string()]);
}

/// The vault the readiness denominator exists for: one embeddable note beside
/// the three kinds of file the pass never selects — an image, a code file
/// (outside `all`), and an empty markdown note.
fn mixed_vault_facts() -> BTreeMap<String, NoteEmbedFacts> {
    [
        ("note.md".to_string(), vault("markdown")),
        ("image.png".to_string(), vault("png")),
        ("script.rs".to_string(), vault("code")),
        ("empty.md".to_string(), facts(Some("markdown"), "vault", 0)),
    ]
    .into_iter()
    .collect()
}

/// The defect: readiness compared raw `note_embeddings` rows against every
/// indexed file, so a vault holding one attachment stayed "indexing" forever.
/// The denominator is that pair of counts after a pass over a mixed vault — it
/// has to come out full, with the three unembeddable files counted as skipped
/// rather than as work the pass left behind.
#[test]
fn coverage_over_a_mixed_vault_counts_only_what_the_pass_embeds() {
    let conn = conn_with_vector_schema();
    let facts = mixed_vault_facts();
    vector_db::upsert_embedding(&conn, "note.md", &[0.1_f32; 4]).expect("seed note embedding");

    let coverage = embed_coverage(&conn, &facts, EmbeddingScope::Documents, true);
    // `note_embed_facts` reads the same `notes` rows as `get_note_count`, which
    // is what the status payload reports as `total_notes`.
    let total_notes = facts.len();
    let eligible_notes = coverage.eligible_notes;
    let embedded_eligible_notes = coverage.embedded_eligible_notes;

    assert_eq!(total_notes, 4, "four files are indexed");
    assert_eq!(
        (eligible_notes, embedded_eligible_notes),
        (1, 1),
        "the pass embeds the markdown note, so its coverage is complete"
    );
    assert_eq!(
        coverage.skipped_notes, 3,
        "the image, the code file and the empty note are skips, not leftovers"
    );
}

/// Notes off with blocks on is embedding work the pass still runs, but none of
/// it is note-level: the pass selects no note, records an ended attempt, and a
/// denominator counted as if notes were on would read `partial` forever. Every
/// note is a skip in that configuration, even one that still holds a vector.
#[test]
fn coverage_with_note_embedding_off_reports_every_note_as_skipped() {
    let conn = conn_with_vector_schema();
    let facts = mixed_vault_facts();
    vector_db::upsert_embedding(&conn, "note.md", &[0.1_f32; 4]).expect("seed note embedding");

    let coverage = embed_coverage(&conn, &facts, EmbeddingScope::Documents, false);

    assert_eq!(
        (coverage.eligible_notes, coverage.embedded_eligible_notes),
        (0, 0),
        "no note-level work exists, so none can be pending"
    );
    assert_eq!(coverage.skipped_notes, facts.len());
}

/// A vector whose note is no longer eligible under the resolved scope, and one
/// whose note row is gone, must not inflate the numerator — and the numerator
/// must never exceed the denominator while the raw count still reports them.
#[test]
fn coverage_keeps_stale_and_out_of_scope_vectors_out_of_the_numerator() {
    let conn = conn_with_vector_schema();
    let facts = mixed_vault_facts();
    vector_db::upsert_embedding(&conn, "note.md", &[0.1_f32; 4]).expect("seed note embedding");
    // Embedded while the scope was `all`, out of scope now.
    vector_db::upsert_embedding(&conn, "script.rs", &[0.1_f32; 4]).expect("seed stale vector");
    // Its notes row is gone: deleted while the pass was elsewhere.
    vector_db::upsert_embedding(&conn, "gone.md", &[0.1_f32; 4]).expect("seed ghost vector");

    let coverage = embed_coverage(&conn, &facts, EmbeddingScope::Documents, true);

    assert_eq!(
        (coverage.eligible_notes, coverage.embedded_eligible_notes),
        (1, 1)
    );
    assert!(coverage.embedded_eligible_notes <= coverage.eligible_notes);
    assert_eq!(
        vector_db::get_embedding_count(&conn),
        3,
        "the raw count keeps every row for the consumers that gate on it"
    );
}

/// Scope is what decides every number: the same vectors that are stale under
/// `documents` are coverage under `all`, and the code file the pass skips under
/// `documents` becomes eligible work there — while the image and the empty note
/// stay skips in every scope.
#[test]
fn coverage_follows_the_resolved_scope() {
    let conn = conn_with_vector_schema();
    let facts = mixed_vault_facts();
    vector_db::upsert_embedding(&conn, "note.md", &[0.1_f32; 4]).expect("seed note embedding");

    let all = embed_coverage(&conn, &facts, EmbeddingScope::All, true);
    assert_eq!((all.eligible_notes, all.embedded_eligible_notes), (2, 1));
    assert_eq!(all.skipped_notes, 2);

    let markdown = embed_coverage(&conn, &facts, EmbeddingScope::Markdown, true);
    assert_eq!(
        (
            markdown.eligible_notes,
            markdown.embedded_eligible_notes,
            markdown.skipped_notes
        ),
        (1, 1, 3)
    );
}

/// Both flags off is the one configuration where no pass can do any work, and
/// readiness has to read it as nothing pending. Either flag on must keep the
/// coverage visible: a vault with only block embedding switched off still has
/// note vectors to embed, and hiding its banner would be a silent regression.
#[test]
fn only_both_flags_off_leave_no_embedding_work() {
    assert!(!embedding_work_enabled(false, false));
    assert!(embedding_work_enabled(true, false));
    assert!(embedding_work_enabled(false, true));
    assert!(embedding_work_enabled(true, true));
}

/// Completion has to be scoped to the work it covers, or an attempt that ended
/// under a previous scope would mark the current scope's notes finished.
#[test]
fn an_ended_attempt_only_vouches_for_its_own_scope() {
    for scope in ALL_SCOPES {
        let code = embedding_scope_code(scope);
        assert!(embed_attempt_completed(1, code, scope));
        for other in ALL_SCOPES {
            if other != scope {
                assert!(
                    !embed_attempt_completed(1, code, other),
                    "{code:?} is not {other:?}'s completion signal"
                );
            }
        }
    }
}

/// Startup before its first pass has ended nothing, so incomplete coverage must
/// read as work still to come rather than as a finished, partial index.
#[test]
fn no_ended_attempt_never_vouches_for_anything() {
    for scope in ALL_SCOPES {
        assert!(!embed_attempt_completed(
            0,
            embedding_scope_code(scope),
            scope
        ));
    }
}

fn cached_note(path: &str) -> IndexNoteMeta {
    IndexNoteMeta {
        id: path.to_string(),
        path: path.to_string(),
        title: path.to_string(),
        name: path.to_string(),
        mtime_ms: 0,
        ctime_ms: 0,
        size_bytes: 0,
        blurb: String::new(),
        file_type: Some("markdown".to_string()),
        source: None,
    }
}

fn markdown_facts(path: &str) -> BTreeMap<String, NoteEmbedFacts> {
    BTreeMap::from([(
        path.to_string(),
        NoteEmbedFacts {
            file_type: Some("markdown".to_string()),
            source: None,
            char_count: 200,
        },
    )])
}

/// A cold model load on every launch, taken before the pass knew whether it had
/// anything to embed, is what made an up-to-date vault slow to open (R1).
/// `handle_embed_batch` now asks both halves of that question — pending notes and
/// pending sections — and returns before `get_or_init` when neither has work.
#[test]
fn a_fully_embedded_vault_has_no_embed_work_before_the_model_load() {
    let tmp = tempfile::TempDir::new().expect("temp dir");
    let conn =
        search_db::open_search_db_at_path(&tmp.path().join("search.db")).expect("db open");
    vector_db::init_vector_schema(&conn).expect("vector schema");
    vector_db::upsert_embedding(&conn, NOTE, &[0.1_f32; 4]).expect("seed note embedding");
    let cache = BTreeMap::from([(NOTE.to_string(), cached_note(NOTE))]);
    let facts = markdown_facts(NOTE);

    let pending = notes_pending_embedding(&conn, &cache, &facts, true, EmbeddingScope::Markdown);

    assert!(
        pending.is_empty(),
        "an embedded note with no sections leaves the pass nothing to do"
    );
    assert!(
        !block_embed_work_pending(&conn),
        "an empty section table must not keep the pass alive"
    );
}

/// The gate's dangerous direction is skipping work that exists: a note with no
/// stored vector is exactly what the pass is for.
#[test]
fn a_note_without_a_vector_is_still_planned() {
    let conn = conn_with_vector_schema();
    let cache = BTreeMap::from([(NOTE.to_string(), cached_note(NOTE))]);
    let facts = markdown_facts(NOTE);

    assert_eq!(
        notes_pending_embedding(&conn, &cache, &facts, true, EmbeddingScope::Markdown),
        vec![NOTE.to_string()]
    );
    assert!(
        notes_pending_embedding(&conn, &cache, &facts, false, EmbeddingScope::Markdown).is_empty(),
        "a disabled note pass plans nothing"
    );
}

/// A section query that cannot run reports work pending, not an empty plan: the
/// pass then surfaces its own error. Reading it as "nothing to embed" would drop
/// a vault's block work silently, because the early return skips the block pass
/// that would have logged the failure.
#[test]
fn an_unreadable_section_table_counts_as_block_work() {
    let conn = conn_with_vector_schema();

    assert!(
        block_embed_work_pending(&conn),
        "a failed section query must not read as an empty plan"
    );
}
