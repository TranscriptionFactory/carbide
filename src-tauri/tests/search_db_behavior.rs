use crate::features::notes::service as notes_service;
use crate::features::search::db::{
    compute_sync_plan, count_bases_many, extract_frontmatter_properties, get_backlinks,
    get_manifest, get_note_meta, get_orphan_outlinks, get_outlinks, list_note_paths_by_prefix,
    open_search_db_at_path, query_bases, re_resolve_orphan_outlinks, rebuild_index, remove_note,
    remove_notes_by_prefix, rename_folder_paths, rename_note_path, search, search_headings,
    set_outlinks, suggest, suggest_planned, sync_index, upsert_note, upsert_note_simple,
};
use crate::features::search::model::{BaseFilter, BaseQuery, IndexNoteMeta, SearchScope};
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
            blurb: String::new(),
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

    let results = search(&conn, "body", SearchScope::All, 10, None, true).expect("search should succeed");
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
        blurb: String::new(),
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
        blurb: String::new(),
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
        blurb: String::new(),
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
        blurb: String::new(),
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
        blurb: String::new(),
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
        blurb: String::new(),
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
        blurb: String::new(),
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
            blurb: String::new(),
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
        blurb: String::new(),
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
        blurb: String::new(),
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
        blurb: String::new(),
        file_type: Some("pdf".to_string()),
        source: None,
    };
    upsert_note(&conn, &meta, "quarterly results revenue growth").expect("upsert should succeed");

    let results = search(&conn, "quarterly", SearchScope::All, 10, None, true).expect("search should succeed");
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].note.file_type, Some("pdf".to_string()));
}

#[test]
fn search_ranks_verbatim_phrase_above_scattered_terms() {
    let tmp = TempDir::new().expect("temp dir");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let insert = |path: &str, title: &str, body: &str| {
        let meta = IndexNoteMeta {
            id: path.to_string(),
            path: path.to_string(),
            title: title.to_string(),
            name: path.trim_end_matches(".md").to_string(),
            mtime_ms: 100,
            ctime_ms: 50,
            size_bytes: body.len() as i64,
            blurb: String::new(),
            file_type: None,
            source: None,
        };
        upsert_note(&conn, &meta, body).expect("upsert should succeed");
    };

    // The correct note contains the query as a verbatim phrase, once, and its
    // title shares no words with the query.
    insert(
        "2026-06-08.md",
        "2026-06-08",
        "Consistency is the name of the game when building habits.",
    );
    // Decoys repeat every individual query token many times but never as the
    // phrase. Before phrase-aware matching these outranked the correct note
    // because each common term's IDF collapsed to ~0 and bm25 went flat.
    insert(
        "game-theory.md",
        "Game Theory Names",
        "game game game theory. the the the. of of of. name name names naming named.",
    );
    insert(
        "offsite.md",
        "Offsite Theme Notes",
        "the theme of the offsite. theory. names. the the the of of. game over.",
    );

    let results = search(&conn, "name of the game", SearchScope::All, 10, None, true)
        .expect("search should succeed");
    assert_eq!(
        results.first().map(|h| h.note.path.as_str()),
        Some("2026-06-08.md"),
        "verbatim-phrase note should rank first, got: {:?}",
        results.iter().map(|h| &h.note.path).collect::<Vec<_>>()
    );

    // Recall is preserved when no exact phrase exists: a note containing all
    // terms (non-adjacent) still matches.
    let recall = search(&conn, "consistency habits", SearchScope::All, 10, None, true)
        .expect("search should succeed");
    assert_eq!(
        recall.first().map(|h| h.note.path.as_str()),
        Some("2026-06-08.md")
    );
}

#[test]
fn suggest_multiword_does_not_leak_body_only_matches() {
    let tmp = TempDir::new().expect("temp dir");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let insert = |path: &str, title: &str, body: &str| {
        let meta = IndexNoteMeta {
            id: path.to_string(),
            path: path.to_string(),
            title: title.to_string(),
            name: path.trim_end_matches(".md").to_string(),
            mtime_ms: 100,
            ctime_ms: 50,
            size_bytes: body.len() as i64,
            blurb: String::new(),
            file_type: None,
            source: None,
        };
        upsert_note(&conn, &meta, body).expect("upsert should succeed");
    };

    // "alpha" is in the title; "bravo" appears only in the body.
    insert("alpha-journal.md", "Alpha Journal", "the body mentions bravo many times");
    // A note that genuinely has both terms in its title.
    insert("alpha-bravo.md", "Alpha Bravo Plan", "unrelated body");

    // Suggestions are scoped to title/name/path. A multi-word query must not
    // surface alpha-journal just because "bravo" is in its body.
    let hits = suggest(&conn, "alpha bravo", 10).expect("suggest should succeed");
    let paths: Vec<&str> = hits.iter().map(|h| h.note.path.as_str()).collect();
    assert!(
        paths.contains(&"alpha-bravo.md"),
        "title containing both terms should match, got: {paths:?}"
    );
    assert!(
        !paths.contains(&"alpha-journal.md"),
        "body-only match must not leak into title/path suggestions, got: {paths:?}"
    );
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
        blurb: String::new(),
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
        blurb: String::new(),
        file_type: None,
        source: None,
    };
    upsert_note(&conn, &meta, "hello world").expect("upsert");

    let results = query_bases(
        &conn,
        BaseQuery {
            filters: vec![],
            sort: vec![],
            limit: 100,
            offset: 0,
        },
    )
    .expect("query_bases");
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
        blurb: String::new(),
        file_type: None,
        source: None,
    };
    upsert_note(&conn, &meta, "content").expect("upsert");

    let results = query_bases(
        &conn,
        BaseQuery {
            filters: vec![],
            sort: vec![],
            limit: 100,
            offset: 0,
        },
    )
    .expect("query_bases");
    assert_eq!(results.rows[0].note.ctime_ms, 0);
}

// The count query and the row query are built from the same WHERE clause, so a
// filter on a task_agg column has to resolve in both. It did not: the count
// query had no join and every such view errored at prepare time.
#[test]
fn query_bases_filters_on_task_count() {
    let tmp = TempDir::new().expect("temp dir");
    let db_dir = TempDir::new().expect("db dir");
    let root = tmp.path();

    write_md(root, "busy.md", "# Busy\n\n- [ ] one\n- [ ] two\n- [x] three\n");
    write_md(root, "quiet.md", "# Quiet\n\nNo tasks here.\n");

    let conn = open_search_db_at_path(&db_dir.path().join("test.db")).expect("db");
    let cancel = AtomicBool::new(false);
    rebuild_index(None, "v", &conn, root, &cancel, &|_, _| {}, &mut || {}).expect("rebuild");

    let results = query_bases(
        &conn,
        BaseQuery {
            filters: vec![BaseFilter {
                property: "task_count".into(),
                operator: "gt".into(),
                value: "0".into(),
            }],
            sort: vec![],
            limit: 100,
            offset: 0,
        },
    )
    .expect("query_bases with a task_count filter");

    assert_eq!(results.rows.len(), 1);
    assert_eq!(results.rows[0].note.path, "busy.md");
    assert_eq!(results.total, 1);
}

#[test]
fn query_bases_total_matches_filtered_rows_for_task_columns() {
    let tmp = TempDir::new().expect("temp dir");
    let db_dir = TempDir::new().expect("db dir");
    let root = tmp.path();

    write_md(root, "a.md", "- [ ] pending\n");
    write_md(root, "b.md", "- [x] finished\n");
    write_md(root, "c.md", "plain\n");

    let conn = open_search_db_at_path(&db_dir.path().join("test.db")).expect("db");
    let cancel = AtomicBool::new(false);
    rebuild_index(None, "v", &conn, root, &cancel, &|_, _| {}, &mut || {}).expect("rebuild");

    let results = query_bases(
        &conn,
        BaseQuery {
            filters: vec![BaseFilter {
                property: "tasks_done".into(),
                operator: "gte".into(),
                value: "1".into(),
            }],
            sort: vec![],
            limit: 100,
            offset: 0,
        },
    )
    .expect("query_bases with a tasks_done filter");

    assert_eq!(results.rows.len(), 1);
    assert_eq!(results.rows[0].note.path, "b.md");
    assert_eq!(results.total, results.rows.len());
}

#[test]
fn count_bases_many_agrees_with_query_bases_on_task_columns() {
    let tmp = TempDir::new().expect("temp dir");
    let db_dir = TempDir::new().expect("db dir");
    let root = tmp.path();

    write_md(root, "a.md", "- [ ] one\n- [ ] two\n");
    write_md(root, "b.md", "nothing\n");

    let conn = open_search_db_at_path(&db_dir.path().join("test.db")).expect("db");
    let cancel = AtomicBool::new(false);
    rebuild_index(None, "v", &conn, root, &cancel, &|_, _| {}, &mut || {}).expect("rebuild");

    let query = BaseQuery {
        filters: vec![BaseFilter {
            property: "tasks_todo".into(),
            operator: "gte".into(),
            value: "2".into(),
        }],
        sort: vec![],
        limit: 100,
        offset: 0,
    };

    let counts = count_bases_many(&conn, std::slice::from_ref(&query)).expect("count_bases_many");
    let results = query_bases(&conn, query).expect("query_bases");

    assert_eq!(counts, vec![1]);
    assert_eq!(results.total, 1);
}

#[test]
fn search_headings_respects_limit_and_orders_by_note_then_line() {
    let tmp = TempDir::new().expect("temp dir");
    let db_dir = TempDir::new().expect("db dir");
    let root = tmp.path();

    write_md(root, "b.md", "# Alpha one\n\ntext\n\n# Alpha two\n\ntext\n");
    write_md(root, "a.md", "# Alpha three\n\ntext\n\n# Alpha four\n\ntext\n");

    let conn = open_search_db_at_path(&db_dir.path().join("test.db")).expect("db");
    let cancel = AtomicBool::new(false);
    rebuild_index(None, "v", &conn, root, &cancel, &|_, _| {}, &mut || {}).expect("rebuild");

    let all = search_headings(&conn, "Alpha", 10).expect("search_headings");
    assert_eq!(all.len(), 4);
    // Every heading starts with the query, so all four score 1.0 and the
    // tiebreak is (note_path, line).
    assert_eq!(
        all.iter()
            .map(|h| (h.note_path.as_str(), h.line))
            .collect::<Vec<_>>(),
        vec![("a.md", 0), ("a.md", 4), ("b.md", 0), ("b.md", 4)]
    );

    let capped = search_headings(&conn, "Alpha", 2).expect("search_headings");
    assert_eq!(capped.len(), 2);
    assert_eq!(
        capped.iter().map(|h| h.line).collect::<Vec<_>>(),
        all.iter().take(2).map(|h| h.line).collect::<Vec<_>>()
    );
}

#[test]
fn search_headings_ranks_exact_above_substring_above_fuzzy() {
    let tmp = TempDir::new().expect("temp dir");
    let db_dir = TempDir::new().expect("db dir");
    let root = tmp.path();

    write_md(root, "z_fuzzy.md", "# R e l e a s e notes\n\ntext\n");
    write_md(root, "y_substring.md", "# Draft release plan\n\ntext\n");
    write_md(root, "x_exact.md", "# Release\n\ntext\n");

    let conn = open_search_db_at_path(&db_dir.path().join("test.db")).expect("db");
    let cancel = AtomicBool::new(false);
    rebuild_index(None, "v", &conn, root, &cancel, &|_, _| {}, &mut || {}).expect("rebuild");

    let hits = search_headings(&conn, "release", 10).expect("search_headings");
    let paths: Vec<&str> = hits.iter().map(|h| h.note_path.as_str()).collect();

    assert_eq!(paths, vec!["x_exact.md", "y_substring.md", "z_fuzzy.md"]);
    assert!(hits[0].score > hits[1].score);
    assert!(hits[1].score > hits[2].score);
}

#[test]
fn resolve_batch_outlinks_resolves_bare_stem() {
    let tmp = TempDir::new().expect("temp dir");
    let db_dir = TempDir::new().expect("db dir");
    let root = tmp.path();

    write_md(root, "journal/2026-05-09.md", "# May 9th");
    write_md(root, "notes/daily.md", "See [[2026-05-09]] for details");

    let conn = open_search_db_at_path(&db_dir.path().join("test.db")).expect("db");
    let cancel = AtomicBool::new(false);
    rebuild_index(None, "v", &conn, root, &cancel, &|_, _| {}, &mut || {}).expect("rebuild");

    let backlinks = get_backlinks(&conn, "journal/2026-05-09.md").expect("backlinks");
    assert_eq!(backlinks.len(), 1);
    assert_eq!(backlinks[0].path, "notes/daily.md");

    let outlinks = get_outlinks(&conn, "notes/daily.md").expect("outlinks");
    assert_eq!(outlinks.len(), 1);
    assert_eq!(outlinks[0].path, "journal/2026-05-09.md");
}

#[test]
fn resolve_batch_outlinks_handles_path_with_slash() {
    let tmp = TempDir::new().expect("temp dir");
    let db_dir = TempDir::new().expect("db dir");
    let root = tmp.path();

    write_md(root, "subfolder/note.md", "# A note");
    write_md(root, "index.md", "Link to [[subfolder/note]]");

    let conn = open_search_db_at_path(&db_dir.path().join("test.db")).expect("db");
    let cancel = AtomicBool::new(false);
    rebuild_index(None, "v", &conn, root, &cancel, &|_, _| {}, &mut || {}).expect("rebuild");

    let backlinks = get_backlinks(&conn, "subfolder/note.md").expect("backlinks");
    assert_eq!(backlinks.len(), 1);
    assert_eq!(backlinks[0].path, "index.md");
}

#[test]
fn resolve_batch_outlinks_ambiguous_stem_falls_back() {
    let tmp = TempDir::new().expect("temp dir");
    let db_dir = TempDir::new().expect("db dir");
    let root = tmp.path();

    write_md(root, "a/foo.md", "# Foo A");
    write_md(root, "b/foo.md", "# Foo B");
    write_md(root, "linker.md", "Link to [[foo]]");

    let conn = open_search_db_at_path(&db_dir.path().join("test.db")).expect("db");
    let cancel = AtomicBool::new(false);
    rebuild_index(None, "v", &conn, root, &cancel, &|_, _| {}, &mut || {}).expect("rebuild");

    let orphans = get_orphan_outlinks(&conn, "linker.md").expect("orphans");
    assert_eq!(orphans.len(), 1);
    assert_eq!(orphans[0].target_path, "foo.md");
}

#[test]
fn resolve_batch_outlinks_root_level_note() {
    let tmp = TempDir::new().expect("temp dir");
    let db_dir = TempDir::new().expect("db dir");
    let root = tmp.path();

    write_md(root, "foo.md", "# Foo");
    write_md(root, "bar.md", "Link to [[foo]]");

    let conn = open_search_db_at_path(&db_dir.path().join("test.db")).expect("db");
    let cancel = AtomicBool::new(false);
    rebuild_index(None, "v", &conn, root, &cancel, &|_, _| {}, &mut || {}).expect("rebuild");

    let backlinks = get_backlinks(&conn, "foo.md").expect("backlinks");
    assert_eq!(backlinks.len(), 1);
    assert_eq!(backlinks[0].path, "bar.md");
}

#[test]
fn rebuild_re_resolves_cross_batch_orphans() {
    let tmp = TempDir::new().expect("temp dir");
    let db_dir = TempDir::new().expect("db dir");
    let root = tmp.path();

    write_md(root, "journal/2026-05-09.md", "# May 9th");
    write_md(root, "notes/source.md", "See [[2026-05-09]]");
    for i in 0..100 {
        write_md(root, &format!("filler/{:03}.md", i), "# filler");
    }

    let conn = open_search_db_at_path(&db_dir.path().join("test.db")).expect("db");
    let cancel = AtomicBool::new(false);
    rebuild_index(None, "v", &conn, root, &cancel, &|_, _| {}, &mut || {}).expect("rebuild");

    let backlinks = get_backlinks(&conn, "journal/2026-05-09.md").expect("backlinks");
    assert_eq!(backlinks.len(), 1, "cross-batch link should be resolved by re_resolve_orphan_outlinks");
    assert_eq!(backlinks[0].path, "notes/source.md");
}

#[test]
fn search_date_range_filters_by_mtime() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let notes = [("recent.md", 5_000_i64), ("old.md", 1_000_i64)];
    for (path, mtime) in notes {
        let meta = IndexNoteMeta {
            id: path.to_string(),
            path: path.to_string(),
            title: path.to_string(),
            name: path.to_string(),
            mtime_ms: mtime,
            ctime_ms: mtime,
            size_bytes: 10,
            blurb: String::new(),
            file_type: None,
            source: None,
        };
        upsert_note(&conn, &meta, "metaboloformer benchmarks").expect("upsert should succeed");
    }

    let all = search(&conn, "metaboloformer", SearchScope::All, 10, None, true).expect("search");
    assert_eq!(all.len(), 2);

    let windowed = search(
        &conn,
        "metaboloformer",
        SearchScope::All,
        10,
        Some((4_000, 6_000)),
        true,
    )
    .expect("search");
    assert_eq!(windowed.len(), 1);
    assert_eq!(windowed[0].note.path, "recent.md");
}

#[test]
fn paths_in_mtime_range_returns_only_in_window() {
    use crate::features::search::db::paths_in_mtime_range;

    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    for (path, mtime) in [("a.md", 1_000_i64), ("b.md", 5_000_i64), ("c.md", 9_000_i64)] {
        let meta = IndexNoteMeta {
            id: path.to_string(),
            path: path.to_string(),
            title: path.to_string(),
            name: path.to_string(),
            mtime_ms: mtime,
            ctime_ms: mtime,
            size_bytes: 10,
            blurb: String::new(),
            file_type: None,
            source: None,
        };
        upsert_note(&conn, &meta, "body").expect("upsert should succeed");
    }

    let in_range = paths_in_mtime_range(&conn, 4_000, 9_000).expect("range query");
    assert_eq!(in_range.len(), 1);
    assert!(in_range.contains("b.md"));
}

#[test]
fn rename_folder_paths_uses_char_offset_for_multibyte_prefix() {
    use crate::features::search::vector_db;

    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");
    vector_db::init_vector_schema(&conn).expect("vector schema should init");

    let meta = IndexNoteMeta {
        id: "café/note.md".to_string(),
        path: "café/note.md".to_string(),
        title: "Note".to_string(),
        name: "note".to_string(),
        mtime_ms: 100,
        ctime_ms: 50,
        size_bytes: 10,
        blurb: String::new(),
        file_type: None,
        source: None,
    };
    upsert_note(&conn, &meta, "body").expect("upsert should succeed");
    vector_db::upsert_embedding(&conn, "café/note.md", &[0.1, 0.2]).expect("embedding upsert");

    // "café/" is 5 chars but 6 bytes; a byte-based substr offset would eat the
    // first character of every child path.
    let renamed = rename_folder_paths(&conn, "café/", "renamed/").expect("rename should succeed");
    assert_eq!(renamed, 1);

    let manifest = get_manifest(&conn).expect("manifest should load");
    assert!(manifest.contains_key("renamed/note.md"));
    assert!(vector_db::get_embedding(&conn, "renamed/note.md").is_some());
    assert!(vector_db::get_embedding(&conn, "renamed/ote.md").is_none());
}

#[test]
fn upsert_linked_content_invalidates_embedding_when_body_changes() {
    use crate::features::search::db::upsert_linked_content;
    use crate::features::search::model::LinkedSourceMeta;
    use crate::features::search::vector_db;

    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");
    vector_db::init_vector_schema(&conn).expect("vector schema should init");
    let linked_meta = LinkedSourceMeta::default();

    let (meta, _) = upsert_linked_content(
        &conn,
        "papers",
        "/refs",
        "/refs/paper.pdf",
        "Paper",
        "extracted text v1",
        &[],
        "pdf",
        1_000,
        &linked_meta,
    )
    .expect("first upsert should succeed");
    vector_db::upsert_embedding(&conn, &meta.path, &[0.1, 0.2]).expect("embedding upsert");

    // Re-import with identical extracted text keeps the vector.
    upsert_linked_content(
        &conn,
        "papers",
        "/refs",
        "/refs/paper.pdf",
        "Paper",
        "extracted text v1",
        &[],
        "pdf",
        2_000,
        &linked_meta,
    )
    .expect("unchanged upsert should succeed");
    assert!(vector_db::get_embedding(&conn, &meta.path).is_some());

    // Re-import with changed extracted text drops it so the embed pass recomputes.
    upsert_linked_content(
        &conn,
        "papers",
        "/refs",
        "/refs/paper.pdf",
        "Paper",
        "extracted text v2",
        &[],
        "pdf",
        3_000,
        &linked_meta,
    )
    .expect("changed upsert should succeed");
    assert!(vector_db::get_embedding(&conn, &meta.path).is_none());
}

// A linked source folder is a tree, not a flat list: files under subfolders must
// keep their location in the note path so the explorer can render the subfolders
// and same-named files in different subfolders stop overwriting each other.
#[test]
fn upsert_linked_content_keeps_the_subfolder_in_the_note_path() {
    use crate::features::search::db::upsert_linked_content;
    use crate::features::search::model::LinkedSourceMeta;

    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let upsert = |file_path: &str, body: &str| {
        let meta = LinkedSourceMeta {
            external_file_path: Some(file_path.to_string()),
            ..Default::default()
        };
        upsert_linked_content(
            &conn, "papers", "/refs", file_path, "Paper", body, &[], "pdf", 1_000, &meta,
        )
        .expect("upsert should succeed")
        .0
    };

    let top = upsert("/refs/paper.pdf", "top level");
    let nested = upsert("/refs/2024/ml/paper.pdf", "nested");

    assert_eq!(top.path, "@linked/papers/paper.pdf");
    assert_eq!(nested.path, "@linked/papers/2024/ml/paper.pdf");
}

// Rows written under the old flat scheme must not linger next to the nested row
// for the same file, or the explorer shows the document twice.
#[test]
fn upsert_linked_content_replaces_a_row_whose_path_scheme_changed() {
    use crate::features::search::db::{find_linked_note_path, upsert_linked_content};
    use crate::features::search::model::LinkedSourceMeta;

    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");
    let file_path = "/refs/2024/paper.pdf";
    let meta = LinkedSourceMeta {
        external_file_path: Some(file_path.to_string()),
        ..Default::default()
    };

    // Simulates the pre-existing flat row: the root the file is scanned under
    // does not prefix it, so the path collapses to the bare file name.
    let (flat, _) = upsert_linked_content(
        &conn, "papers", "/elsewhere", file_path, "Paper", "body", &[], "pdf", 1_000, &meta,
    )
    .expect("flat upsert should succeed");
    assert_eq!(flat.path, "@linked/papers/paper.pdf");

    let (nested, stale) = upsert_linked_content(
        &conn, "papers", "/refs", file_path, "Paper", "body", &[], "pdf", 2_000, &meta,
    )
    .expect("nested upsert should succeed");

    assert_eq!(nested.path, "@linked/papers/2024/paper.pdf");
    assert_eq!(stale.as_deref(), Some("@linked/papers/paper.pdf"));
    assert_eq!(
        find_linked_note_path(&conn, "papers", file_path).expect("lookup should succeed"),
        Some("@linked/papers/2024/paper.pdf".to_string())
    );
}

// Removal only knows the file's absolute path, so it has to find the row by that
// rather than recompute a note path it cannot derive without the source root.
#[test]
fn remove_linked_content_finds_the_nested_row_by_external_path() {
    use crate::features::search::db::{remove_linked_content, upsert_linked_content};
    use crate::features::search::model::LinkedSourceMeta;

    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");
    let file_path = "/refs/2024/ml/paper.pdf";
    let meta = LinkedSourceMeta {
        external_file_path: Some(file_path.to_string()),
        ..Default::default()
    };

    upsert_linked_content(
        &conn, "papers", "/refs", file_path, "Paper", "body", &[], "pdf", 1_000, &meta,
    )
    .expect("upsert should succeed");

    let removed =
        remove_linked_content(&conn, "papers", file_path).expect("remove should succeed");

    assert_eq!(removed, "@linked/papers/2024/ml/paper.pdf");
    let remaining: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE path LIKE '@linked/papers/%'",
            [],
            |row| row.get(0),
        )
        .expect("count should query");
    assert_eq!(remaining, 0);
}

// DOI enrichment resolves authors, year, journal and abstract against a remote
// CSL lookup, so those values exist nowhere in the file itself. A later scan
// re-extracts what it can and supplies None for the rest, which is the case
// update_linked_metadata's COALESCE(?n, col) is written to handle.
#[test]
fn reindexing_a_linked_source_preserves_previously_extracted_metadata() {
    use crate::features::search::db::upsert_linked_content;
    use crate::features::search::model::LinkedSourceMeta;

    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let full = LinkedSourceMeta {
        citekey: Some("smith2024".into()),
        authors: Some("Smith, J.".into()),
        year: Some(2024),
        doi: Some("10.1234/test".into()),
        isbn: Some("978-0-123456-78-9".into()),
        arxiv_id: Some("2401.00001".into()),
        journal: Some("Nature".into()),
        r#abstract: Some("An abstract.".into()),
        item_type: Some("article".into()),
        external_file_path: Some("/files/paper.pdf".into()),
        linked_source_id: Some("zotero-123".into()),
        vault_relative_path: Some("papers/paper.pdf".into()),
        home_relative_path: Some("~/papers/paper.pdf".into()),
    };

    let (meta, _) = upsert_linked_content(
        &conn,
        "papers",
        "/files",
        "/files/paper.pdf",
        "Paper",
        "extracted text",
        &[],
        "pdf",
        1_000,
        &full,
    )
    .expect("first upsert should succeed");

    // Same source name, root and file path, so linked_note_path is unchanged and
    // the second call updates the first row rather than evicting it. Only the
    // metadata is sparser.
    upsert_linked_content(
        &conn,
        "papers",
        "/files",
        "/files/paper.pdf",
        "Paper",
        "extracted text",
        &[],
        "pdf",
        2_000,
        &LinkedSourceMeta::default(),
    )
    .expect("re-index should succeed");

    let row = conn
        .query_row(
            "SELECT citekey, authors, doi, journal, abstract FROM notes WHERE path = ?1",
            rusqlite::params![meta.path],
            |r| {
                Ok((
                    r.get::<_, Option<String>>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                ))
            },
        )
        .expect("row should still exist");

    assert_eq!(
        row.0.as_deref(),
        Some("smith2024"),
        "citekey survives re-index"
    );
    assert_eq!(
        row.1.as_deref(),
        Some("Smith, J."),
        "authors survive re-index"
    );
    assert_eq!(
        row.2.as_deref(),
        Some("10.1234/test"),
        "doi survives re-index"
    );
    assert_eq!(row.3.as_deref(), Some("Nature"), "journal survives re-index");
    assert_eq!(
        row.4.as_deref(),
        Some("An abstract."),
        "abstract survives re-index"
    );
}

// The AI vault context renders one line per related note, and the line body is
// the blurb. IndexNoteMeta had no such field, so every backlink, outlink and
// similar-note reference reached the frontend without one.
#[test]
fn index_sourced_notes_carry_the_blurb() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let meta = |path: &str| IndexNoteMeta {
        id: path.to_string(),
        path: path.to_string(),
        title: "Hybrid retrieval".to_string(),
        name: "hybrid".to_string(),
        mtime_ms: 100,
        ctime_ms: 50,
        size_bytes: 10,
        blurb: String::new(),
        file_type: None,
        source: None,
    };

    let target = meta("docs/target.md");
    let source = meta("docs/source.md");
    upsert_note(&conn, &target, "Combining BM25 with dense vectors improves recall.")
        .expect("upsert should succeed");
    upsert_note(&conn, &source, "Cites the retrieval note.").expect("upsert should succeed");
    set_outlinks(&conn, "docs/source.md", &["docs/target.md".to_string()])
        .expect("set outlinks should succeed");

    let looked_up = get_note_meta(&conn, "docs/target.md")
        .expect("meta should load")
        .expect("note should exist");
    assert_eq!(
        looked_up.blurb,
        "Combining BM25 with dense vectors improves recall."
    );

    let backlinks = get_backlinks(&conn, "docs/target.md").expect("backlinks should load");
    assert_eq!(backlinks.len(), 1);
    assert_eq!(backlinks[0].blurb, "Cites the retrieval note.");

    let outlinks = get_outlinks(&conn, "docs/source.md").expect("outlinks should load");
    assert_eq!(outlinks.len(), 1);
    assert_eq!(
        outlinks[0].blurb,
        "Combining BM25 with dense vectors improves recall."
    );

    let hits = search(&conn, "recall", SearchScope::All, 10, None, true).expect("search should run");
    let hit = hits
        .iter()
        .find(|h| h.note.path == "docs/target.md")
        .expect("target should match");
    assert_eq!(
        hit.note.blurb,
        "Combining BM25 with dense vectors improves recall."
    );
}


fn note_meta(path: &str, title: &str, name: &str) -> IndexNoteMeta {
    IndexNoteMeta {
        id: path.to_string(),
        path: path.to_string(),
        title: title.to_string(),
        name: name.to_string(),
        mtime_ms: 100,
        ctime_ms: 50,
        size_bytes: 10,
        blurb: String::new(),
        file_type: None,
        source: None,
    }
}

fn task_rows(conn: &rusqlite::Connection, path: &str) -> Vec<(String, String, i64)> {
    let mut stmt = conn
        .prepare(
            "SELECT text, status, line_number FROM tasks WHERE path = ?1 ORDER BY line_number",
        )
        .expect("statement should prepare");
    let rows = stmt
        .query_map([path], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .expect("query should run")
        .collect::<Result<Vec<_>, _>>()
        .expect("rows should decode");
    rows
}

fn task_rowids(conn: &rusqlite::Connection, path: &str) -> Vec<i64> {
    let mut stmt = conn
        .prepare("SELECT rowid FROM tasks WHERE path = ?1 ORDER BY line_number")
        .expect("statement should prepare");
    let rows = stmt
        .query_map([path], |r| r.get(0))
        .expect("query should run")
        .collect::<Result<Vec<_>, _>>()
        .expect("rows should decode");
    rows
}

fn notes_rowid(conn: &rusqlite::Connection, path: &str) -> Vec<i64> {
    let mut stmt = conn
        .prepare("SELECT rowid FROM notes WHERE path = ?1")
        .expect("statement should prepare");
    let rows = stmt
        .query_map([path], |r| r.get(0))
        .expect("query should run")
        .collect::<Result<Vec<_>, _>>()
        .expect("rows should decode");
    rows
}

fn inline_tag_rowids(conn: &rusqlite::Connection, path: &str) -> Vec<i64> {
    let mut stmt = conn
        .prepare("SELECT rowid FROM note_inline_tags WHERE path = ?1 ORDER BY tag, line")
        .expect("statement should prepare");
    let rows = stmt
        .query_map([path], |r| r.get(0))
        .expect("query should run")
        .collect::<Result<Vec<_>, _>>()
        .expect("rows should decode");
    rows
}

fn section_rowids(conn: &rusqlite::Connection, path: &str) -> Vec<i64> {
    let mut stmt = conn
        .prepare("SELECT rowid FROM note_sections WHERE path = ?1 ORDER BY heading_id")
        .expect("statement should prepare");
    let rows = stmt
        .query_map([path], |r| r.get(0))
        .expect("query should run")
        .collect::<Result<Vec<_>, _>>()
        .expect("rows should decode");
    rows
}

fn code_block_rowids(conn: &rusqlite::Connection, path: &str) -> Vec<i64> {
    let mut stmt = conn
        .prepare("SELECT rowid FROM note_code_blocks WHERE path = ?1 ORDER BY line")
        .expect("statement should prepare");
    let rows = stmt
        .query_map([path], |r| r.get(0))
        .expect("query should run")
        .collect::<Result<Vec<_>, _>>()
        .expect("rows should decode");
    rows
}

#[test]
fn saving_a_note_indexes_its_tasks() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");
    let meta = note_meta("notes/a.md", "A", "a");

    upsert_note_simple(&conn, &meta, "# Plan\n- [ ] alpha\n- [x] beta\n").expect("save should run");

    assert_eq!(
        task_rows(&conn, "notes/a.md"),
        vec![
            ("alpha".to_string(), "todo".to_string(), 2),
            ("beta".to_string(), "done".to_string(), 3),
        ]
    );
}

#[test]
fn saving_a_toggled_checkbox_updates_the_task_row() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");
    let meta = note_meta("notes/a.md", "A", "a");

    upsert_note_simple(&conn, &meta, "- [ ] alpha\n").expect("first save should run");
    assert_eq!(
        task_rows(&conn, "notes/a.md"),
        vec![("alpha".to_string(), "todo".to_string(), 1)]
    );

    upsert_note_simple(&conn, &meta, "- [x] alpha\n").expect("second save should run");
    assert_eq!(
        task_rows(&conn, "notes/a.md"),
        vec![("alpha".to_string(), "done".to_string(), 1)],
        "the tasks table must follow the tick without a sync or a rebuild"
    );
}

#[test]
fn saving_an_added_task_line_inserts_a_row() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");
    let meta = note_meta("notes/a.md", "A", "a");

    upsert_note_simple(&conn, &meta, "- [ ] alpha\n").expect("first save should run");
    upsert_note_simple(&conn, &meta, "- [ ] alpha\n- [ ] beta\n").expect("second save should run");

    assert_eq!(
        task_rows(&conn, "notes/a.md"),
        vec![
            ("alpha".to_string(), "todo".to_string(), 1),
            ("beta".to_string(), "todo".to_string(), 2),
        ]
    );
}

#[test]
fn saving_a_removed_task_line_deletes_its_row() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");
    let meta = note_meta("notes/a.md", "A", "a");

    upsert_note_simple(&conn, &meta, "- [ ] alpha\n- [ ] beta\n").expect("first save should run");
    upsert_note_simple(&conn, &meta, "- [ ] alpha\n").expect("second save should run");

    assert_eq!(
        task_rows(&conn, "notes/a.md"),
        vec![("alpha".to_string(), "todo".to_string(), 1)]
    );
}

// `upsert_note_simple` upserts the notes row without deleting it. A REPLACE
// here would fire ON DELETE CASCADE on the four FK'd child tables —
// `note_inline_tags`, `note_sections`, `note_code_blocks`, `tasks` — wiping the
// task rows before `sync_tasks` was reached, so the unchanged-rows guard in
// `tasks::service::save_tasks` always read an empty table and could never fire.
// The other four child tables of notes carry no foreign key, and the 16 notes
// columns this path does not write are preserved by the same upsert.
#[test]
fn resaving_unchanged_content_does_not_rewrite_task_rows() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");
    let a = note_meta("notes/a.md", "A", "a");
    let b = note_meta("notes/b.md", "B", "b");

    upsert_note_simple(&conn, &a, "- [ ] alpha\n").expect("save a should run");
    // A second note holds the highest rowid, so any delete-and-reinsert of A's
    // row lands on a fresh rowid instead of silently reclaiming the old one.
    upsert_note_simple(&conn, &b, "- [ ] beta\n").expect("save b should run");

    let before = task_rowids(&conn, "notes/a.md");
    assert_eq!(before.len(), 1);

    upsert_note_simple(&conn, &a, "- [ ] alpha\n").expect("identical resave should run");
    assert_eq!(
        task_rowids(&conn, "notes/a.md"),
        before,
        "a save that changes no task line must not rewrite the tasks table"
    );

    upsert_note_simple(&conn, &a, "- [x] alpha\n").expect("changed resave should run");
    assert_ne!(
        task_rowids(&conn, "notes/a.md"),
        before,
        "rowid stability must be able to see a real rewrite, or the check above proves nothing"
    );
}

// The notes row is now updated in place. `notes.path` is the TEXT PRIMARY KEY
// and no query reads the implicit rowid, so the old REPLACE silently churned
// it on every save — this probes the statement change directly, with no
// sync-helper interference.
#[test]
fn resaving_a_note_keeps_its_notes_rowid() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");
    let a = note_meta("notes/a.md", "A", "a");
    let b = note_meta("notes/b.md", "B", "b");

    upsert_note_simple(&conn, &a, "- [ ] alpha\n").expect("save a should run");
    // A second note holds the highest rowid, so a delete-and-reinsert of A's
    // row lands on a fresh rowid instead of silently reclaiming the old one.
    upsert_note_simple(&conn, &b, "- [ ] beta\n").expect("save b should run");

    let before = notes_rowid(&conn, "notes/a.md");
    assert_eq!(before.len(), 1);

    upsert_note_simple(&conn, &a, "- [ ] alpha\n").expect("identical resave should run");
    assert_eq!(
        notes_rowid(&conn, "notes/a.md"),
        before,
        "an identical resave must update the note row in place, not delete and reinsert it"
    );
}

// `page_offsets` and `source` belong to the plain-content upsert path. Before
// this fix the markdown path's REPLACE nulled both on every save, reachable
// whenever a note crosses between the two upsert paths — e.g. a markdown file
// that grows past the 50 MB indexing limit and is re-indexed as plain content,
// then edited back down and saved as markdown.
#[test]
fn resaving_a_note_preserves_page_offsets_and_source() {
    use crate::features::search::db::upsert_linked_content;
    use crate::features::search::model::LinkedSourceMeta;

    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let (meta, _) = upsert_linked_content(
        &conn,
        "papers",
        "/files",
        "/files/paper.pdf",
        "Paper",
        "extracted text",
        &[1, 5, 9],
        "pdf",
        1_000,
        &LinkedSourceMeta::default(),
    )
    .expect("linked upsert should succeed");

    let read_row = |conn: &rusqlite::Connection| {
        conn.query_row(
            "SELECT page_offsets, source FROM notes WHERE path = ?1",
            rusqlite::params![meta.path],
            |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, Option<String>>(1)?)),
        )
        .expect("notes row should still exist")
    };

    let seeded = read_row(&conn);
    assert_eq!(seeded.0.as_deref(), Some("[1,5,9]"));
    assert_eq!(seeded.1.as_deref(), Some("linked"));

    upsert_note_simple(&conn, &meta, "markdown body\n").expect("markdown resave should run");

    let after = read_row(&conn);
    assert_eq!(
        after.0.as_deref(),
        Some("[1,5,9]"),
        "a markdown save must not clear the plain-content path's page offsets"
    );
    assert_eq!(
        after.1.as_deref(),
        Some("linked"),
        "a markdown save must not reset the note's source back to the vault default"
    );
}

// The four tests below are regression locks on the plain-content upsert path,
// which runs no sync helper — seeded child rows can only disappear through the
// notes FK cascade. They seed one child row directly per FK'd table, re-index
// via `upsert_linked_content`, and assert the rowid survives.
#[test]
fn reindexing_plain_content_preserves_inline_tag_rows() {
    use crate::features::search::db::upsert_linked_content;
    use crate::features::search::model::LinkedSourceMeta;

    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let (meta, _) = upsert_linked_content(
        &conn,
        "papers",
        "/files",
        "/files/paper.pdf",
        "Paper",
        "extracted text",
        &[],
        "pdf",
        1_000,
        &LinkedSourceMeta::default(),
    )
    .expect("linked upsert should succeed");

    conn.execute(
        "INSERT INTO note_inline_tags (path, tag, line, source) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![meta.path, "imported", 1, "body"],
    )
    .expect("seed row should insert");

    let before = inline_tag_rowids(&conn, &meta.path);
    assert_eq!(before.len(), 1);

    upsert_linked_content(
        &conn,
        "papers",
        "/files",
        "/files/paper.pdf",
        "Paper",
        "extracted text",
        &[],
        "pdf",
        2_000,
        &LinkedSourceMeta::default(),
    )
    .expect("re-index should succeed");

    assert_eq!(
        inline_tag_rowids(&conn, &meta.path),
        before,
        "a linked re-index must not cascade the note's inline tag rows away"
    );
}

#[test]
fn reindexing_plain_content_preserves_section_rows() {
    use crate::features::search::db::upsert_linked_content;
    use crate::features::search::model::LinkedSourceMeta;

    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let (meta, _) = upsert_linked_content(
        &conn,
        "papers",
        "/files",
        "/files/paper.pdf",
        "Paper",
        "extracted text",
        &[],
        "pdf",
        1_000,
        &LinkedSourceMeta::default(),
    )
    .expect("linked upsert should succeed");

    conn.execute(
        "INSERT INTO note_sections (path, heading_id, level, title, start_line, end_line, word_count) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![meta.path, "imported-1", 1, "Imported", 0, 3, 10],
    )
    .expect("seed row should insert");

    let before = section_rowids(&conn, &meta.path);
    assert_eq!(before.len(), 1);

    upsert_linked_content(
        &conn,
        "papers",
        "/files",
        "/files/paper.pdf",
        "Paper",
        "extracted text",
        &[],
        "pdf",
        2_000,
        &LinkedSourceMeta::default(),
    )
    .expect("re-index should succeed");

    assert_eq!(
        section_rowids(&conn, &meta.path),
        before,
        "a linked re-index must not cascade the note's section rows away"
    );
}

#[test]
fn reindexing_plain_content_preserves_code_block_rows() {
    use crate::features::search::db::upsert_linked_content;
    use crate::features::search::model::LinkedSourceMeta;

    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let (meta, _) = upsert_linked_content(
        &conn,
        "papers",
        "/files",
        "/files/paper.pdf",
        "Paper",
        "extracted text",
        &[],
        "pdf",
        1_000,
        &LinkedSourceMeta::default(),
    )
    .expect("linked upsert should succeed");

    conn.execute(
        "INSERT INTO note_code_blocks (path, line, language, length) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![meta.path, 4, "python", 12],
    )
    .expect("seed row should insert");

    let before = code_block_rowids(&conn, &meta.path);
    assert_eq!(before.len(), 1);

    upsert_linked_content(
        &conn,
        "papers",
        "/files",
        "/files/paper.pdf",
        "Paper",
        "extracted text",
        &[],
        "pdf",
        2_000,
        &LinkedSourceMeta::default(),
    )
    .expect("re-index should succeed");

    assert_eq!(
        code_block_rowids(&conn, &meta.path),
        before,
        "a linked re-index must not cascade the note's code block rows away"
    );
}

#[test]
fn reindexing_plain_content_preserves_task_rows() {
    use crate::features::search::db::upsert_linked_content;
    use crate::features::search::model::LinkedSourceMeta;

    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let (meta, _) = upsert_linked_content(
        &conn,
        "papers",
        "/files",
        "/files/paper.pdf",
        "Paper",
        "extracted text",
        &[],
        "pdf",
        1_000,
        &LinkedSourceMeta::default(),
    )
    .expect("linked upsert should succeed");

    conn.execute(
        "INSERT INTO tasks (id, path, text, status, due_date, line_number, section) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params!["imported-task-1", meta.path, "imported task", "todo", Option::<String>::None, 1, Option::<String>::None],
    )
    .expect("seed row should insert");

    let before = task_rowids(&conn, &meta.path);
    assert_eq!(before.len(), 1);

    upsert_linked_content(
        &conn,
        "papers",
        "/files",
        "/files/paper.pdf",
        "Paper",
        "extracted text",
        &[],
        "pdf",
        2_000,
        &LinkedSourceMeta::default(),
    )
    .expect("re-index should succeed");

    assert_eq!(
        task_rowids(&conn, &meta.path),
        before,
        "a linked re-index must not cascade the note's task rows away"
    );
}

// `content_snippet` and `first_image_path` belong to the markdown upsert
// path. The plain-content path must not clear them when a note crosses
// between the two paths — e.g. a markdown file that grows past the 50 MB
// indexing limit and is re-indexed as plain content.
#[test]
fn reindexing_plain_content_preserves_content_snippet_and_first_image_path() {
    use crate::features::search::db::upsert_linked_content;
    use crate::features::search::model::LinkedSourceMeta;

    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    let (meta, _) = upsert_linked_content(
        &conn,
        "papers",
        "/files",
        "/files/paper.pdf",
        "Paper",
        "extracted text",
        &[],
        "pdf",
        1_000,
        &LinkedSourceMeta::default(),
    )
    .expect("linked upsert should succeed");

    upsert_note_simple(&conn, &meta, "markdown body\n").expect("markdown save should run");
    conn.execute(
        "UPDATE notes SET content_snippet = ?2, first_image_path = ?3 WHERE path = ?1",
        rusqlite::params![meta.path, "seeded snippet", "img/pic.png"],
    )
    .expect("seed values should stick");

    upsert_linked_content(
        &conn,
        "papers",
        "/files",
        "/files/paper.pdf",
        "Paper",
        "extracted text",
        &[],
        "pdf",
        2_000,
        &LinkedSourceMeta::default(),
    )
    .expect("re-index should succeed");

    let row = conn
        .query_row(
            "SELECT content_snippet, first_image_path FROM notes WHERE path = ?1",
            rusqlite::params![meta.path],
            |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, Option<String>>(1)?)),
        )
        .expect("notes row should still exist");

    assert_eq!(
        row.0.as_deref(),
        Some("seeded snippet"),
        "a plain-content re-index must not clear the markdown path's content snippet"
    );
    assert_eq!(
        row.1.as_deref(),
        Some("img/pic.png"),
        "a plain-content re-index must not clear the markdown path's first image path"
    );
}

#[test]
fn saving_a_canvas_note_indexes_no_tasks() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");
    let meta = note_meta("boards/board.canvas", "Board", "board.canvas");

    upsert_note_simple(&conn, &meta, "- [ ] alpha\n").expect("save should run");

    assert!(
        task_rows(&conn, "boards/board.canvas").is_empty(),
        "a task line number is only addressable in a markdown file"
    );
}

#[test]
fn removing_a_note_evicts_its_task_rows() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");
    let meta = note_meta("notes/a.md", "A", "a");

    upsert_note_simple(&conn, &meta, "- [ ] alpha\n").expect("save should run");
    assert_eq!(task_rows(&conn, "notes/a.md").len(), 1);

    remove_note(&conn, "notes/a.md").expect("remove should run");
    assert!(task_rows(&conn, "notes/a.md").is_empty());
}

#[test]
fn removing_notes_by_prefix_evicts_task_rows() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");
    let inside = note_meta("folder/a.md", "A", "a");
    let outside = note_meta("other/b.md", "B", "b");

    upsert_note_simple(&conn, &inside, "- [ ] alpha\n").expect("save inside should run");
    upsert_note_simple(&conn, &outside, "- [ ] beta\n").expect("save outside should run");

    remove_notes_by_prefix(&conn, "folder").expect("prefix removal should run");
    assert!(task_rows(&conn, "folder/a.md").is_empty());
    assert_eq!(
        task_rows(&conn, "other/b.md").len(),
        1,
        "a sibling folder's tasks must survive"
    );
}

#[test]
fn search_includes_linked_sources_by_default() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    upsert_note(
        &conn,
        &note_meta("notes/vault.md", "Vault", "Vault"),
        "photosynthesis in vault",
    )
    .expect("vault upsert should succeed");
    upsert_note(
        &conn,
        &note_meta("@linked/zotero/paper.pdf", "Paper", "Paper"),
        "photosynthesis in paper",
    )
    .expect("linked upsert should succeed");

    let hits = search(&conn, "photosynthesis", SearchScope::All, 10, None, true)
        .expect("search should succeed");

    let paths: Vec<&str> = hits.iter().map(|h| h.note.path.as_str()).collect();
    assert!(paths.contains(&"@linked/zotero/paper.pdf"));
    assert!(paths.contains(&"notes/vault.md"));
}

#[test]
fn search_excludes_linked_sources_when_setting_is_off() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    upsert_note(
        &conn,
        &note_meta("notes/vault.md", "Vault", "Vault"),
        "photosynthesis in vault",
    )
    .expect("vault upsert should succeed");
    upsert_note(
        &conn,
        &note_meta("@linked/zotero/paper.pdf", "Paper", "Paper"),
        "photosynthesis in paper",
    )
    .expect("linked upsert should succeed");

    let hits = search(&conn, "photosynthesis", SearchScope::All, 10, None, false)
        .expect("search should succeed");

    let paths: Vec<&str> = hits.iter().map(|h| h.note.path.as_str()).collect();
    assert_eq!(paths, vec!["notes/vault.md"]);
}

#[test]
fn excluding_linked_sources_does_not_cost_vault_result_slots() {
    let tmp = TempDir::new().expect("temp dir should be created");
    let conn = open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open");

    for i in 0..5 {
        upsert_note(
            &conn,
            &note_meta(&format!("@linked/zotero/paper{i}.pdf"), "Paper", "Paper"),
            "photosynthesis",
        )
        .expect("linked upsert should succeed");
    }
    for i in 0..3 {
        upsert_note(
            &conn,
            &note_meta(&format!("notes/vault{i}.md"), "Vault", "Vault"),
            "photosynthesis",
        )
        .expect("vault upsert should succeed");
    }

    let hits = search(&conn, "photosynthesis", SearchScope::All, 3, None, false)
        .expect("search should succeed");

    assert_eq!(hits.len(), 3, "the limit must be filled with vault notes");
    assert!(hits.iter().all(|h| !h.note.path.starts_with("@linked/")));
}
