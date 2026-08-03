use crate::features::notes::service::{file_meta, note_meta_from_index};
use crate::features::search::db::CachedNoteMeta;
use std::collections::HashMap;
use std::path::Path;
use tempfile::TempDir;

fn mk_temp_dir() -> TempDir {
    tempfile::tempdir().expect("temp dir should be created")
}

fn indexed(root: &Path, rel_path: &str) -> CachedNoteMeta {
    let (mtime_ms, _, size_bytes) =
        file_meta(&root.join(rel_path)).expect("stat should succeed");
    CachedNoteMeta {
        title: "Indexed Title".to_string(),
        content_snippet: Some("an indexed blurb".to_string()),
        mtime_ms,
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
    let tmp = mk_temp_dir();
    let root = tmp.path();
    std::fs::write(root.join("note.md"), "# On Disk Heading\n\nbody").expect("note should write");
    let cached = cache("note.md", indexed(root, "note.md"));

    let meta = note_meta_from_index(root, "note.md", Some(&cached)).expect("meta should build");

    assert_eq!(meta.title, "Indexed Title");
    assert_eq!(meta.blurb, "an indexed blurb");
    assert_eq!(meta.color.as_deref(), Some("red"));
    assert_eq!(meta.icon.as_deref(), Some("🚀"));
    assert_eq!(meta.is_a.as_deref(), Some("project"));
    assert_eq!(meta.name, "note");
}

#[test]
fn a_stale_index_row_degrades_to_the_filename_rather_than_reading_the_file() {
    let tmp = mk_temp_dir();
    let root = tmp.path();
    std::fs::write(root.join("note.md"), "# On Disk Heading\n\nbody").expect("note should write");

    // The file changed since it was indexed: same mtime, different size.
    let mut stale = indexed(root, "note.md");
    stale.size_bytes += 1;
    let cached = cache("note.md", stale);

    let meta = note_meta_from_index(root, "note.md", Some(&cached)).expect("meta should build");

    assert_eq!(meta.title, "note");
    assert_eq!(meta.blurb, "");
    assert_eq!(meta.color, None);
    assert_eq!(meta.icon, None);
    assert_eq!(meta.is_a, None);
}

#[test]
fn a_row_whose_mtime_moved_on_is_also_treated_as_stale() {
    let tmp = mk_temp_dir();
    let root = tmp.path();
    std::fs::write(root.join("note.md"), "# On Disk Heading\n\nbody").expect("note should write");

    let mut stale = indexed(root, "note.md");
    stale.mtime_ms += 1_000;
    let cached = cache("note.md", stale);

    let meta = note_meta_from_index(root, "note.md", Some(&cached)).expect("meta should build");

    assert_eq!(meta.title, "note");
    assert_eq!(meta.blurb, "");
}

#[test]
fn a_cold_index_degrades_to_the_filename_for_every_entry() {
    let tmp = mk_temp_dir();
    let root = tmp.path();
    std::fs::create_dir_all(root.join("Projects")).expect("folder should be created");
    std::fs::write(root.join("Projects/Deep Note.md"), "# Heading\n\nbody")
        .expect("note should write");

    // No index at all — the cold-start case, which is the common one because the
    // first listing of a session runs before index_build, and browse-mode vaults
    // never index.
    let meta =
        note_meta_from_index(root, "Projects/Deep Note.md", None).expect("meta should build");

    assert_eq!(meta.title, "Deep Note");
    assert_eq!(meta.name, "Deep Note");
    assert_eq!(meta.path, "Projects/Deep Note.md");
    assert_eq!(meta.blurb, "");
}

#[test]
fn stat_metadata_always_wins_over_the_indexed_copy() {
    let tmp = mk_temp_dir();
    let root = tmp.path();
    std::fs::write(root.join("note.md"), "# Heading\n\nbody").expect("note should write");
    let (mtime_ms, _, size_bytes) = file_meta(&root.join("note.md")).expect("stat should succeed");
    let cached = cache("note.md", indexed(root, "note.md"));

    let meta = note_meta_from_index(root, "note.md", Some(&cached)).expect("meta should build");

    assert_eq!(meta.mtime_ms, mtime_ms);
    assert_eq!(meta.size_bytes, size_bytes);
}

#[test]
fn a_missing_file_surfaces_the_stat_error() {
    let tmp = mk_temp_dir();
    let root = tmp.path();
    assert!(note_meta_from_index(root, "absent.md", None).is_err());
}
