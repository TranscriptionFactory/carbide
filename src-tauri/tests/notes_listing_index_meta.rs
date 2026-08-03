use crate::features::notes::service::{file_meta, note_meta_from_index};
use crate::features::search::db::CachedNoteMeta;
use crate::shared::storage;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static TEST_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

fn mk_temp_dir() -> PathBuf {
    let counter = TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!(
        "carbide-listing-meta-test-{}-{}",
        storage::now_ms(),
        counter
    ));
    std::fs::create_dir_all(&dir).expect("temp dir should be created");
    dir
}

fn indexed(root: &Path, rel_path: &str) -> CachedNoteMeta {
    let (mtime_ms, ctime_ms, size_bytes) =
        file_meta(&root.join(rel_path)).expect("stat should succeed");
    CachedNoteMeta {
        title: "Indexed Title".to_string(),
        content_snippet: Some("an indexed blurb".to_string()),
        mtime_ms,
        ctime_ms,
        size_bytes,
        color: Some("red".to_string()),
        icon: Some("🚀".to_string()),
        is_a: Some("project".to_string()),
    }
}

fn cache(rel_path: &str, meta: CachedNoteMeta) -> HashMap<String, CachedNoteMeta> {
    HashMap::from([(rel_path.to_string(), meta)])
}

#[test]
fn a_fresh_index_row_supplies_title_blurb_and_properties() {
    let root = mk_temp_dir();
    std::fs::write(root.join("note.md"), "# On Disk Heading\n\nbody").expect("note should write");
    let cached = cache("note.md", indexed(&root, "note.md"));

    let meta = note_meta_from_index(&root, "note.md", Some(&cached)).expect("meta should build");

    assert_eq!(meta.title, "Indexed Title");
    assert_eq!(meta.blurb, "an indexed blurb");
    assert_eq!(meta.color.as_deref(), Some("red"));
    assert_eq!(meta.icon.as_deref(), Some("🚀"));
    assert_eq!(meta.is_a.as_deref(), Some("project"));
    assert_eq!(meta.name, "note");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn a_stale_index_row_degrades_to_the_filename_rather_than_reading_the_file() {
    let root = mk_temp_dir();
    std::fs::write(root.join("note.md"), "# On Disk Heading\n\nbody").expect("note should write");

    // The file changed since it was indexed: same mtime, different size.
    let mut stale = indexed(&root, "note.md");
    stale.size_bytes += 1;
    let cached = cache("note.md", stale);

    let meta = note_meta_from_index(&root, "note.md", Some(&cached)).expect("meta should build");

    assert_eq!(meta.title, "note");
    assert_eq!(meta.blurb, "");
    assert_eq!(meta.color, None);
    assert_eq!(meta.icon, None);
    assert_eq!(meta.is_a, None);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn a_row_whose_mtime_moved_on_is_also_treated_as_stale() {
    let root = mk_temp_dir();
    std::fs::write(root.join("note.md"), "# On Disk Heading\n\nbody").expect("note should write");

    let mut stale = indexed(&root, "note.md");
    stale.mtime_ms += 1_000;
    let cached = cache("note.md", stale);

    let meta = note_meta_from_index(&root, "note.md", Some(&cached)).expect("meta should build");

    assert_eq!(meta.title, "note");
    assert_eq!(meta.blurb, "");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn a_cold_index_degrades_to_the_filename_for_every_entry() {
    let root = mk_temp_dir();
    std::fs::create_dir_all(root.join("Projects")).expect("folder should be created");
    std::fs::write(root.join("Projects/Deep Note.md"), "# Heading\n\nbody")
        .expect("note should write");

    // No index at all — the cold-start case, which is the common one because the
    // first listing of a session runs before index_build, and browse-mode vaults
    // never index.
    let meta =
        note_meta_from_index(&root, "Projects/Deep Note.md", None).expect("meta should build");

    assert_eq!(meta.title, "Deep Note");
    assert_eq!(meta.name, "Deep Note");
    assert_eq!(meta.path, "Projects/Deep Note.md");
    assert_eq!(meta.blurb, "");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn stat_metadata_always_wins_over_the_indexed_copy() {
    let root = mk_temp_dir();
    std::fs::write(root.join("note.md"), "# Heading\n\nbody").expect("note should write");
    let (mtime_ms, _, size_bytes) = file_meta(&root.join("note.md")).expect("stat should succeed");
    let cached = cache("note.md", indexed(&root, "note.md"));

    let meta = note_meta_from_index(&root, "note.md", Some(&cached)).expect("meta should build");

    assert_eq!(meta.mtime_ms, mtime_ms);
    assert_eq!(meta.size_bytes, size_bytes);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn a_missing_file_surfaces_the_stat_error() {
    let root = mk_temp_dir();
    assert!(note_meta_from_index(&root, "absent.md", None).is_err());
    let _ = std::fs::remove_dir_all(&root);
}
