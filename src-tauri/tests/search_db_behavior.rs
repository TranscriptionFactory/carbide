use crate::features::notes::service as notes_service;
use crate::features::search::db::{
    compute_sync_plan, get_backlinks, get_manifest, get_orphan_outlinks, get_outlinks,
    gfm_link_targets, internal_link_targets, list_note_paths_by_prefix, open_search_db_at_path,
    rebuild_index, remove_notes_by_prefix, rename_folder_paths, rename_note_path, search,
    set_outlinks, suggest_planned, sync_index, upsert_note, wiki_link_targets,
};
use crate::features::search::model::{IndexNoteMeta, SearchScope};
use std::cell::RefCell;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

fn write_md(dir: &Path, rel: &str, content: &str) -> PathBuf {
    let p = dir.join(rel);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).expect("parent dir should be created");
    }
    fs::write(&p, content).expect("file should be written");
    p
}

fn set_mtime(path: &Path, secs_offset: i64) {
    let t = filetime::FileTime::from_unix_time(1_700_000_000 + secs_offset, 0);
    filetime::set_file_mtime(path, t).expect("mtime should be set");
}

#[test]
fn empty_manifest_all_added() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let root = tmp.path();
    let a = write_md(root, "a.md", "hello");
    let b = write_md(root, "b.md", "world");

    let manifest = BTreeMap::new();
    let disk = vec![a, b];
    let plan = compute_sync_plan(root, &manifest, &disk);

    assert_eq!(plan.added.len(), 2);
    assert!(plan.modified.is_empty());
    assert!(plan.removed.is_empty());
    assert_eq!(plan.unchanged, 0);
}

#[test]
fn unchanged_files_detected() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let root = tmp.path();
    let p = write_md(root, "note.md", "content");
    set_mtime(&p, 0);

    let (mtime, size) = notes_service::file_meta(&p).expect("file metadata should be loaded");
    let mut manifest = BTreeMap::new();
    manifest.insert("note.md".to_string(), (mtime, size));

    let plan = compute_sync_plan(root, &manifest, &[p]);

    assert!(plan.added.is_empty());
    assert!(plan.modified.is_empty());
    assert!(plan.removed.is_empty());
    assert_eq!(plan.unchanged, 1);
}

#[test]
fn remove_notes_by_prefix_deletes_matching_and_keeps_others() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let notes = vec![
        ("docs/a.md", "A", "a", "body a"),
        ("docs/sub/b.md", "B", "b", "body b"),
        ("misc/c.md", "C", "c", "body c"),
    ];
    for (path, title, name, body) in &notes {
        let meta = IndexNoteMeta {
            id: path.to_string(),
            path: path.to_string(),
            title: title.to_string(),
            name: name.to_string(),
            mtime_ms: 100,
            size_bytes: 10,
            file_type: None,
        };
        upsert_note(&conn, &meta, body).expect("upsert should succeed");
    }

    set_outlinks(&conn, "docs/a.md", &["misc/c.md".to_string()])
        .expect("set outlinks should succeed");
    set_outlinks(&conn, "docs/sub/b.md", &["docs/a.md".to_string()])
        .expect("set outlinks should succeed");

    remove_notes_by_prefix(&conn, "docs/").expect("prefix delete should succeed");

    let manifest = get_manifest(&conn).expect("manifest should load");
    assert_eq!(manifest.len(), 1);
    assert!(manifest.contains_key("misc/c.md"));

    let results = search(&conn, "body", SearchScope::All, 10).expect("search should succeed");
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].note.path, "misc/c.md");
}

#[test]
fn rename_note_path_moves_note_and_outgoing_source_links() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let a = IndexNoteMeta {
        id: "docs/old.md".to_string(),
        path: "docs/old.md".to_string(),
        title: "Old".to_string(),
        name: "old".to_string(),
        mtime_ms: 100,
        size_bytes: 10,
        file_type: None,
    };
    let b = IndexNoteMeta {
        id: "docs/source.md".to_string(),
        path: "docs/source.md".to_string(),
        title: "Source".to_string(),
        name: "source".to_string(),
        mtime_ms: 100,
        size_bytes: 10,
        file_type: None,
    };
    upsert_note(&conn, &a, "body a").expect("upsert should succeed");
    upsert_note(&conn, &b, "body b").expect("upsert should succeed");
    set_outlinks(&conn, "docs/source.md", &["docs/old.md".to_string()])
        .expect("set outlinks should succeed");
    set_outlinks(&conn, "docs/old.md", &["docs/source.md".to_string()])
        .expect("set outlinks should succeed");

    rename_note_path(&conn, "docs/old.md", "docs/new.md").expect("rename should succeed");

    let backlinks = get_backlinks(&conn, "docs/new.md").expect("backlinks should load");
    assert!(backlinks.is_empty());

    let outlinks = get_outlinks(&conn, "docs/new.md").expect("outlinks should load");
    assert_eq!(outlinks.len(), 1);
    assert_eq!(outlinks[0].path, "docs/source.md");

    let orphans = get_orphan_outlinks(&conn, "docs/source.md").expect("orphans should load");
    assert_eq!(orphans.len(), 1);
    assert_eq!(orphans[0].target_path, "docs/old.md");
    assert_eq!(orphans[0].ref_count, 1);
}

#[test]
fn suggest_planned_returns_missing_targets_ranked_by_ref_count() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let source_a = IndexNoteMeta {
        id: "docs/source-a.md".to_string(),
        path: "docs/source-a.md".to_string(),
        title: "Source A".to_string(),
        name: "source-a".to_string(),
        mtime_ms: 100,
        size_bytes: 10,
        file_type: None,
    };
    let source_b = IndexNoteMeta {
        id: "docs/source-b.md".to_string(),
        path: "docs/source-b.md".to_string(),
        title: "Source B".to_string(),
        name: "source-b".to_string(),
        mtime_ms: 100,
        size_bytes: 10,
        file_type: None,
    };
    let existing = IndexNoteMeta {
        id: "docs/existing.md".to_string(),
        path: "docs/existing.md".to_string(),
        title: "Existing".to_string(),
        name: "existing".to_string(),
        mtime_ms: 100,
        size_bytes: 10,
        file_type: None,
    };

    upsert_note(&conn, &source_a, "body").expect("upsert should succeed");
    upsert_note(&conn, &source_b, "body").expect("upsert should succeed");
    upsert_note(&conn, &existing, "body").expect("upsert should succeed");

    set_outlinks(
        &conn,
        "docs/source-a.md",
        &[
            "docs/planned/high.md".to_string(),
            "docs/planned/low.md".to_string(),
            "docs/existing.md".to_string(),
        ],
    )
    .expect("set outlinks should succeed");
    set_outlinks(
        &conn,
        "docs/source-b.md",
        &["docs/planned/high.md".to_string()],
    )
    .expect("set outlinks should succeed");

    let suggestions = suggest_planned(&conn, "planned", 10).expect("suggest planned should work");
    assert_eq!(suggestions.len(), 2);
    assert_eq!(suggestions[0].target_path, "docs/planned/high.md");
    assert_eq!(suggestions[0].ref_count, 2);
    assert_eq!(suggestions[1].target_path, "docs/planned/low.md");
    assert_eq!(suggestions[1].ref_count, 1);
}

#[test]
fn sync_progress_advances_when_some_files_are_unreadable() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let db_tmp = TempDir::new().expect("db temp dir should be created");
    let root = tmp.path();
    let conn = open_search_db_at_path(&db_tmp.path().join("test.db")).expect("db should open");

    write_md(root, "ok.md", "# ok");
    fs::write(root.join("bad.md"), [0xff, 0xfe, 0xfd]).expect("bad file should be written");

    let cancel = AtomicBool::new(false);
    let progress_points: RefCell<Vec<(usize, usize)>> = RefCell::new(Vec::new());
    let result = sync_index(
        None,
        "test-vault",
        &conn,
        root,
        &cancel,
        &|indexed, total| progress_points.borrow_mut().push((indexed, total)),
        &mut || {},
    )
    .expect("sync should succeed");

    assert!(progress_points
        .borrow()
        .iter()
        .any(|(indexed, _)| *indexed > 0));
    assert_eq!(result.indexed, 2);
    assert_eq!(result.total, 2);
    let manifest = get_manifest(&conn).expect("manifest should load");
    assert!(manifest.contains_key("ok.md"));
}

#[test]
fn rebuild_resolves_batch_outlinks_before_yield() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let root = tmp.path();
    let conn = open_search_db_at_path(&root.join("test.db")).expect("db should open");

    write_md(root, "notes/000-target.md", "# target");
    write_md(root, "notes/001-source.md", "[target](./000-target.md)");
    for i in 0..100 {
        write_md(root, &format!("notes/{:03}-filler.md", i + 2), "# filler");
    }

    let cancel = AtomicBool::new(false);
    let mut first_yield_checked = false;
    rebuild_index(
        None,
        "test-vault",
        &conn,
        root,
        &cancel,
        &|_, _| {},
        &mut || {
            if first_yield_checked {
                return;
            }
            let outlinks =
                get_outlinks(&conn, "notes/001-source.md").expect("outlinks should load");
            assert_eq!(outlinks.len(), 1);
            assert_eq!(outlinks[0].path, "notes/000-target.md");
            first_yield_checked = true;
        },
    )
    .expect("rebuild should succeed");

    assert!(first_yield_checked);
}

#[test]
fn link_target_parsers_cover_spaces_aliases_and_wikilinks() {
    let gfm = gfm_link_targets("[Doc](<Folder Name/child note.md>)", "root.md");
    assert_eq!(gfm, vec!["Folder Name/child note.md".to_string()]);

    let wiki = wiki_link_targets("[[Folder Name/child note#Heading|Alias Label]]", "root.md");
    assert_eq!(wiki, vec!["Folder Name/child note.md".to_string()]);

    let combined = internal_link_targets(
        "[A](./gfm%20target.md) [[wiki target]] ![[embedded]]",
        "docs/source.md",
    );
    assert_eq!(
        combined,
        vec![
            "docs/gfm target.md".to_string(),
            "wiki target.md".to_string()
        ]
    );
}

#[test]
fn rename_folder_paths_escapes_like_wildcards() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let a = IndexNoteMeta {
        id: "old_50%/a.md".to_string(),
        path: "old_50%/a.md".to_string(),
        title: "A".to_string(),
        name: "a".to_string(),
        mtime_ms: 100,
        size_bytes: 10,
        file_type: None,
    };
    let b = IndexNoteMeta {
        id: "old_500/b.md".to_string(),
        path: "old_500/b.md".to_string(),
        title: "B".to_string(),
        name: "b".to_string(),
        mtime_ms: 100,
        size_bytes: 10,
        file_type: None,
    };
    upsert_note(&conn, &a, "body a").expect("upsert should succeed");
    upsert_note(&conn, &b, "body b").expect("upsert should succeed");

    let renamed = rename_folder_paths(&conn, "old_50%/", "new/").expect("rename should succeed");
    assert_eq!(renamed, 1);

    let manifest = get_manifest(&conn).expect("manifest should load");
    assert!(manifest.contains_key("new/a.md"));
    assert!(manifest.contains_key("old_500/b.md"));
    assert!(!manifest.contains_key("old_50%/a.md"));
}

#[test]
fn list_note_paths_by_prefix_respects_folder_boundary() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let notes = vec![
        ("docs/a.md", "A", "a", "body a"),
        ("docs/sub/b.md", "B", "b", "body b"),
        ("docs2/c.md", "C", "c", "body c"),
    ];
    for (path, title, name, body) in &notes {
        let meta = IndexNoteMeta {
            id: path.to_string(),
            path: path.to_string(),
            title: title.to_string(),
            name: name.to_string(),
            mtime_ms: 100,
            size_bytes: 10,
            file_type: None,
        };
        upsert_note(&conn, &meta, body).expect("upsert should succeed");
    }

    let paths = list_note_paths_by_prefix(&conn, "docs/").expect("list by prefix should succeed");
    assert_eq!(
        paths,
        vec!["docs/a.md".to_string(), "docs/sub/b.md".to_string()]
    );
}

#[test]
fn upsert_note_populates_note_headings() {
    let tmp = TempDir::new().expect("temp dir");
    let db = tmp.path().join("test.db");
    let conn = open_search_db_at_path(&db).expect("open db");

    let meta = IndexNoteMeta {
        id: "test.md".into(),
        path: "test.md".into(),
        title: "Test".into(),
        name: "test".into(),
        mtime_ms: 100,
        size_bytes: 50,
        file_type: None,
    };
    upsert_note(&conn, &meta, "# Title\n## Sub\n### Deep").expect("upsert");

    let rows: Vec<(String, i64, String, i64)> = conn
        .prepare("SELECT note_path, level, text, line FROM note_headings WHERE note_path = ?1 ORDER BY line")
        .unwrap()
        .query_map(rusqlite::params!["test.md"], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();

    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0].1, 1);
    assert_eq!(rows[0].2, "Title");
    assert_eq!(rows[1].1, 2);
    assert_eq!(rows[1].2, "Sub");
    assert_eq!(rows[2].1, 3);
    assert_eq!(rows[2].2, "Deep");
}

#[test]
fn upsert_note_populates_note_links() {
    let tmp = TempDir::new().expect("temp dir");
    let db = tmp.path().join("test.db");
    let conn = open_search_db_at_path(&db).expect("open db");

    let meta = IndexNoteMeta {
        id: "notes/test.md".into(),
        path: "notes/test.md".into(),
        title: "Test".into(),
        name: "test".into(),
        mtime_ms: 100,
        size_bytes: 100,
        file_type: None,
    };
    upsert_note(
        &conn,
        &meta,
        "[[Other]] and [link](./local.md) and [ext](https://example.com)",
    )
    .expect("upsert");

    let rows: Vec<(String, String, Option<String>, String)> = conn
        .prepare("SELECT source_path, target_path, link_text, link_type FROM note_links WHERE source_path = ?1 ORDER BY link_type")
        .unwrap()
        .query_map(rusqlite::params!["notes/test.md"], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();

    assert_eq!(rows.len(), 3);

    let external: Vec<_> = rows.iter().filter(|r| r.3 == "external").collect();
    assert_eq!(external.len(), 1);
    assert_eq!(external[0].1, "https://example.com");
    assert_eq!(external[0].2.as_deref(), Some("ext"));

    let wiki: Vec<_> = rows.iter().filter(|r| r.3 == "wiki").collect();
    assert_eq!(wiki.len(), 1);
    assert_eq!(wiki[0].1, "Other.md");

    let md: Vec<_> = rows.iter().filter(|r| r.3 == "markdown").collect();
    assert_eq!(md.len(), 1);
    assert_eq!(md[0].1, "notes/local.md");
}

#[test]
fn upsert_note_populates_target_anchor_and_section_heading() {
    let tmp = TempDir::new().expect("temp dir");
    let db = tmp.path().join("test.db");
    let conn = open_search_db_at_path(&db).expect("open db");

    let meta = IndexNoteMeta {
        id: "notes/test.md".into(),
        path: "notes/test.md".into(),
        title: "Test".into(),
        name: "test".into(),
        mtime_ms: 100,
        size_bytes: 200,
        file_type: None,
    };
    let md =
        "# Intro\n\n[[Other#design]] is relevant.\n\n## Details\n\n[link](./local.md#setup) here.";
    upsert_note(&conn, &meta, md).expect("upsert");

    let rows: Vec<(String, Option<String>, Option<String>, String)> = conn
        .prepare("SELECT target_path, target_anchor, section_heading, link_type FROM note_links WHERE source_path = ?1 ORDER BY link_type")
        .unwrap()
        .query_map(rusqlite::params!["notes/test.md"], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();

    assert_eq!(rows.len(), 2);

    let md_link: Vec<_> = rows.iter().filter(|r| r.3 == "markdown").collect();
    assert_eq!(md_link.len(), 1);
    assert_eq!(md_link[0].1.as_deref(), Some("setup"));
    assert_eq!(md_link[0].2.as_deref(), Some("Details"));

    let wiki_link: Vec<_> = rows.iter().filter(|r| r.3 == "wiki").collect();
    assert_eq!(wiki_link.len(), 1);
    assert_eq!(wiki_link[0].1.as_deref(), Some("design"));
    assert_eq!(wiki_link[0].2.as_deref(), Some("Intro"));
}

#[test]
fn remove_note_clears_headings_and_links() {
    let tmp = TempDir::new().expect("temp dir");
    let db = tmp.path().join("test.db");
    let conn = open_search_db_at_path(&db).expect("open db");

    let meta = IndexNoteMeta {
        id: "test.md".into(),
        path: "test.md".into(),
        title: "Test".into(),
        name: "test".into(),
        mtime_ms: 100,
        size_bytes: 50,
        file_type: None,
    };
    upsert_note(&conn, &meta, "# Title\n[[Other]]").expect("upsert");

    use crate::features::search::db::remove_note;
    remove_note(&conn, "test.md").expect("remove");

    let h_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM note_headings WHERE note_path = 'test.md'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let l_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM note_links WHERE source_path = 'test.md'",
            [],
            |r| r.get(0),
        )
        .unwrap();

    assert_eq!(h_count, 0);
    assert_eq!(l_count, 0);
}

#[test]
fn search_returns_file_type_from_db() {
    let tmp = TempDir::new().expect("temp dir");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let meta = IndexNoteMeta {
        id: "docs/report.pdf".to_string(),
        path: "docs/report.pdf".to_string(),
        title: "Report".to_string(),
        name: "report".to_string(),
        mtime_ms: 100,
        size_bytes: 1000,
        file_type: Some("pdf".to_string()),
    };
    upsert_note(&conn, &meta, "quarterly results revenue growth").expect("upsert should succeed");

    let results = search(&conn, "quarterly", SearchScope::All, 10).expect("search should succeed");
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].note.file_type, Some("pdf".to_string()));
}

#[test]
fn rename_note_propagates_to_headings_and_links() {
    let tmp = TempDir::new().expect("temp dir");
    let db = tmp.path().join("test.db");
    let conn = open_search_db_at_path(&db).expect("open db");

    let meta = IndexNoteMeta {
        id: "old.md".into(),
        path: "old.md".into(),
        title: "Old".into(),
        name: "old".into(),
        mtime_ms: 100,
        size_bytes: 50,
        file_type: None,
    };
    upsert_note(&conn, &meta, "# Title\n[[Target]]").expect("upsert");

    rename_note_path(&conn, "old.md", "new.md").expect("rename");

    let h_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM note_headings WHERE note_path = 'new.md'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let l_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM note_links WHERE source_path = 'new.md'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let old_h: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM note_headings WHERE note_path = 'old.md'",
            [],
            |r| r.get(0),
        )
        .unwrap();

    assert_eq!(h_count, 1);
    assert_eq!(l_count, 1);
    assert_eq!(old_h, 0);
}
