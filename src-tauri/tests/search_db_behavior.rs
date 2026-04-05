use crate::features::notes::service as notes_service;
use crate::features::search::db::{
    compute_sync_plan, extract_frontmatter_properties, get_backlinks, get_manifest,
    get_note_meta, get_orphan_outlinks, get_outlinks, list_note_paths_by_prefix,
    open_search_db_at_path, query_bases, rebuild_index, remove_notes_by_prefix,
    rename_folder_paths, rename_note_path, search, set_outlinks, suggest_planned, sync_index,
    upsert_note,
};
use crate::features::search::model::{BaseQuery, IndexNoteMeta, SearchScope};
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

    let (mtime, _, size) = notes_service::file_meta(&p).expect("file metadata should be loaded");
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
            ctime_ms: 50,
            size_bytes: 10,
            file_type: None,
            source: None,
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
        ctime_ms: 50,
        size_bytes: 10,
        file_type: None,
        source: None,
    };
    let b = IndexNoteMeta {
        id: "docs/source.md".to_string(),
        path: "docs/source.md".to_string(),
        title: "Source".to_string(),
        name: "source".to_string(),
        mtime_ms: 100,
        ctime_ms: 50,
        size_bytes: 10,
        file_type: None,
        source: None,
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
        ctime_ms: 50,
        size_bytes: 10,
        file_type: None,
        source: None,
    };
    let source_b = IndexNoteMeta {
        id: "docs/source-b.md".to_string(),
        path: "docs/source-b.md".to_string(),
        title: "Source B".to_string(),
        name: "source-b".to_string(),
        mtime_ms: 100,
        ctime_ms: 50,
        size_bytes: 10,
        file_type: None,
        source: None,
    };
    let existing = IndexNoteMeta {
        id: "docs/existing.md".to_string(),
        path: "docs/existing.md".to_string(),
        title: "Existing".to_string(),
        name: "existing".to_string(),
        mtime_ms: 100,
        ctime_ms: 50,
        size_bytes: 10,
        file_type: None,
        source: None,
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
fn rebuild_indexes_all_files() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let db_dir = TempDir::new().expect("db temp dir should be created");
    let root = tmp.path();
    let conn = open_search_db_at_path(&db_dir.path().join("test.db")).expect("db should open");

    write_md(root, "notes/000-target.md", "# target");
    write_md(root, "notes/001-source.md", "some content");
    for i in 0..100 {
        write_md(root, &format!("notes/{:03}-filler.md", i + 2), "# filler");
    }

    let cancel = AtomicBool::new(false);
    let result = rebuild_index(
        None,
        "test-vault",
        &conn,
        root,
        &cancel,
        &|_, _| {},
        &mut || {},
    )
    .expect("rebuild should succeed");

    assert_eq!(result.total, 102);
    assert_eq!(result.indexed, 102);
    let manifest = get_manifest(&conn).expect("manifest should load");
    assert!(manifest.contains_key("notes/000-target.md"));
    assert!(manifest.contains_key("notes/001-source.md"));
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
        ctime_ms: 50,
        size_bytes: 10,
        file_type: None,
        source: None,
    };
    let b = IndexNoteMeta {
        id: "old_500/b.md".to_string(),
        path: "old_500/b.md".to_string(),
        title: "B".to_string(),
        name: "b".to_string(),
        mtime_ms: 100,
        ctime_ms: 50,
        size_bytes: 10,
        file_type: None,
        source: None,
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
            ctime_ms: 50,
            size_bytes: 10,
            file_type: None,
            source: None,
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
fn upsert_note_indexes_basic_metadata() {
    let tmp = TempDir::new().expect("temp dir");
    let db = tmp.path().join("test.db");
    let conn = open_search_db_at_path(&db).expect("open db");

    let meta = IndexNoteMeta {
        id: "test.md".into(),
        path: "test.md".into(),
        title: "Test".into(),
        name: "test".into(),
        mtime_ms: 100,
        ctime_ms: 50,
        size_bytes: 50,
        file_type: None,
        source: None,
    };
    upsert_note(&conn, &meta, "# Title\n## Sub\n### Deep").expect("upsert");

    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE path = ?1",
            rusqlite::params!["test.md"],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn remove_note_clears_note_record() {
    let tmp = TempDir::new().expect("temp dir");
    let db = tmp.path().join("test.db");
    let conn = open_search_db_at_path(&db).expect("open db");

    let meta = IndexNoteMeta {
        id: "test.md".into(),
        path: "test.md".into(),
        title: "Test".into(),
        name: "test".into(),
        mtime_ms: 100,
        ctime_ms: 50,
        size_bytes: 50,
        file_type: None,
        source: None,
    };
    upsert_note(&conn, &meta, "# Title\n[[Other]]").expect("upsert");

    use crate::features::search::db::remove_note;
    remove_note(&conn, "test.md").expect("remove");

    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE path = 'test.md'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count, 0);
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
        ctime_ms: 50,
        size_bytes: 1000,
        file_type: Some("pdf".to_string()),
        source: None,
    };
    upsert_note(&conn, &meta, "quarterly results revenue growth").expect("upsert should succeed");

    let results = search(&conn, "quarterly", SearchScope::All, 10).expect("search should succeed");
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].note.file_type, Some("pdf".to_string()));
}

#[test]
fn rename_note_path_moves_note_record() {
    let tmp = TempDir::new().expect("temp dir");
    let db = tmp.path().join("test.db");
    let conn = open_search_db_at_path(&db).expect("open db");

    let meta = IndexNoteMeta {
        id: "old.md".into(),
        path: "old.md".into(),
        title: "Old".into(),
        name: "old".into(),
        mtime_ms: 100,
        ctime_ms: 50,
        size_bytes: 50,
        file_type: None,
        source: None,
    };
    upsert_note(&conn, &meta, "# Title\n[[Target]]").expect("upsert");

    rename_note_path(&conn, "old.md", "new.md").expect("rename");

    let new_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE path = 'new.md'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let old_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE path = 'old.md'",
            [],
            |r| r.get(0),
        )
        .unwrap();

    assert_eq!(new_count, 1);
    assert_eq!(old_count, 0);
}

#[test]
fn frontmatter_properties_empty_when_no_frontmatter() {
    let md = "# Just a heading\n\nSome text.";
    assert!(extract_frontmatter_properties(md).is_empty());
}

#[test]
fn frontmatter_properties_skips_tags_key() {
    let md = "---\ntags: foo\nstatus: draft\n---\n";
    let props = extract_frontmatter_properties(md);
    assert_eq!(props.len(), 1);
    assert_eq!(props[0].0, "status");
}

#[test]
fn frontmatter_properties_detects_types() {
    let md = "---\nstatus: draft\npriority: 5\ndue: 2024-01-15\nactive: true\n---\n";
    let props = extract_frontmatter_properties(md);
    let find = |k: &str| props.iter().find(|(key, _, _)| key == k).cloned();

    let (_, val, typ) = find("status").expect("status should be present");
    assert_eq!(val, "draft");
    assert_eq!(typ, "string");

    let (_, val, typ) = find("priority").expect("priority should be present");
    assert_eq!(val, "5");
    assert_eq!(typ, "number");

    let (_, val, typ) = find("due").expect("due should be present");
    assert_eq!(val, "2024-01-15");
    assert_eq!(typ, "string");

    let (_, val, typ) = find("active").expect("active should be present");
    assert_eq!(val, "true");
    assert_eq!(typ, "boolean");
}

#[test]
fn frontmatter_properties_array_as_json() {
    let md = "---\ncategories:\n  - work\n  - planning\n---\n";
    let props = extract_frontmatter_properties(md);
    assert_eq!(props.len(), 1);
    let (key, val, typ) = &props[0];
    assert_eq!(key, "categories");
    assert_eq!(val, r#"["work","planning"]"#);
    assert_eq!(typ, "array");
}

#[test]
fn frontmatter_properties_strips_surrounding_quotes() {
    let md = "---\ntitle: \"My Note\"\nauthor: 'Alice'\n---\n";
    let props = extract_frontmatter_properties(md);
    let find = |k: &str| props.iter().find(|(key, _, _)| key == k).cloned();

    let (_, val, _) = find("title").expect("title should be present");
    assert_eq!(val, "My Note");

    let (_, val, _) = find("author").expect("author should be present");
    assert_eq!(val, "Alice");
}

#[test]
fn frontmatter_properties_populated_during_index() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let root = tmp.path();
    let db_path = tmp.path().join("test.db");

    write_md(
        root,
        "note.md",
        "---\nstatus: active\npriority: 3\n---\n# Note\n",
    );

    let conn = open_search_db_at_path(&db_path).expect("db should open");
    let cancel = AtomicBool::new(false);
    let mut yield_count = 0;
    rebuild_index(
        None,
        "vault1",
        &conn,
        root,
        &cancel,
        &|_, _| {},
        &mut || yield_count += 1,
    )
    .expect("rebuild should succeed");

    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM note_properties WHERE path = 'note.md'",
            [],
            |r| r.get(0),
        )
        .expect("count query should succeed");
    assert_eq!(count, 2);

    let status_type: String = conn
        .query_row(
            "SELECT type FROM note_properties WHERE path = 'note.md' AND key = 'status'",
            [],
            |r| r.get(0),
        )
        .expect("status query should succeed");
    assert_eq!(status_type, "string");

    let priority_type: String = conn
        .query_row(
            "SELECT type FROM note_properties WHERE path = 'note.md' AND key = 'priority'",
            [],
            |r| r.get(0),
        )
        .expect("priority query should succeed");
    assert_eq!(priority_type, "number");
}

#[test]
fn upsert_note_persists_ctime_ms() {
    let tmp = TempDir::new().expect("temp dir");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("open db");

    let meta = IndexNoteMeta {
        id: "note.md".into(),
        path: "note.md".into(),
        title: "Note".into(),
        name: "note".into(),
        mtime_ms: 2000,
        ctime_ms: 1000,
        size_bytes: 20,
        file_type: None,
        source: None,
    };
    upsert_note(&conn, &meta, "hello world").expect("upsert");

    let results = query_bases(&conn, BaseQuery { filters: vec![], sort: vec![], limit: 100, offset: 0 }).expect("query_bases");
    assert_eq!(results.rows.len(), 1);
    assert_eq!(results.rows[0].note.ctime_ms, 1000);
    assert_eq!(results.rows[0].note.mtime_ms, 2000);
}

#[test]
fn ctime_ms_defaults_to_zero_for_legacy_notes() {
    let tmp = TempDir::new().expect("temp dir");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("open db");

    let meta = IndexNoteMeta {
        id: "old.md".into(),
        path: "old.md".into(),
        title: "Old".into(),
        name: "old".into(),
        mtime_ms: 500,
        ctime_ms: 0,
        size_bytes: 10,
        file_type: None,
        source: None,
    };
    upsert_note(&conn, &meta, "content").expect("upsert");

    let results = query_bases(&conn, BaseQuery { filters: vec![], sort: vec![], limit: 100, offset: 0 }).expect("query_bases");
    assert_eq!(results.rows[0].note.ctime_ms, 0);
}
