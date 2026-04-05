use crate::features::search::db::open_search_db_at_path;
use crate::features::smart_links::{
    default_rules, SmartLinkRule, SmartLinkRuleGroup, SmartLinkSuggestion,
};
use rusqlite::params;
use tempfile::TempDir;

fn setup_db() -> (TempDir, rusqlite::Connection) {
    let tmp = TempDir::new().expect("temp dir");
    let db_path = tmp.path().join("test.db");
    let conn = open_search_db_at_path(&db_path).expect("db open");
    (tmp, conn)
}

fn insert_note(conn: &rusqlite::Connection, path: &str, title: &str, mtime_ms: i64) {
    conn.execute(
        "INSERT OR REPLACE INTO notes (path, title, mtime_ms, ctime_ms, size_bytes, word_count, char_count, heading_count, reading_time_secs, last_indexed_at, file_type) VALUES (?1, ?2, ?3, ?3, 100, 50, 200, 2, 30, 0, 'md')",
        params![path, title, mtime_ms],
    )
    .expect("insert note");
}

fn insert_tag(conn: &rusqlite::Connection, path: &str, tag: &str) {
    conn.execute(
        "INSERT OR REPLACE INTO note_inline_tags (path, tag, line, source) VALUES (?1, ?2, 1, 'frontmatter')",
        params![path, tag],
    )
    .expect("insert tag");
}

fn insert_property(conn: &rusqlite::Connection, path: &str, key: &str, value: &str) {
    conn.execute(
        "INSERT INTO note_properties (path, key, value, type) VALUES (?1, ?2, ?3, 'string')",
        params![path, key, value],
    )
    .expect("insert property");
}

fn compute(
    conn: &rusqlite::Connection,
    note_path: &str,
    groups: &[SmartLinkRuleGroup],
) -> Vec<SmartLinkSuggestion> {
    crate::features::smart_links::rules::execute_rules(conn, note_path, groups, 20)
        .expect("execute_rules")
}

#[test]
fn same_day_finds_notes_modified_same_day() {
    let (_tmp, conn) = setup_db();
    let day_base = 1_700_000_000_000i64;
    insert_note(&conn, "a.md", "Note A", day_base);
    insert_note(&conn, "b.md", "Note B", day_base + 3600_000);
    insert_note(&conn, "c.md", "Note C", day_base + 86_400_000);

    let groups = vec![SmartLinkRuleGroup {
        id: "metadata".into(),
        name: "Metadata".into(),
        enabled: true,
        rules: vec![SmartLinkRule {
            id: "same_day".into(),
            name: "Same day".into(),
            enabled: true,
            weight: 1.0,
            config: Default::default(),
        }],
    }];

    let results = compute(&conn, "a.md", &groups);
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].target_path, "b.md");
    assert_eq!(results[0].rules.len(), 1);
    assert_eq!(results[0].rules[0].rule_id, "same_day");
}

#[test]
fn shared_tag_ranks_by_overlap() {
    let (_tmp, conn) = setup_db();
    let ts = 1_700_000_000_000i64;
    insert_note(&conn, "a.md", "Note A", ts);
    insert_note(&conn, "b.md", "Note B", ts);
    insert_note(&conn, "c.md", "Note C", ts);

    insert_tag(&conn, "a.md", "rust");
    insert_tag(&conn, "a.md", "coding");
    insert_tag(&conn, "b.md", "rust");
    insert_tag(&conn, "b.md", "coding");
    insert_tag(&conn, "c.md", "rust");

    let groups = vec![SmartLinkRuleGroup {
        id: "metadata".into(),
        name: "Metadata".into(),
        enabled: true,
        rules: vec![SmartLinkRule {
            id: "shared_tag".into(),
            name: "Shared tags".into(),
            enabled: true,
            weight: 1.0,
            config: Default::default(),
        }],
    }];

    let results = compute(&conn, "a.md", &groups);
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].target_path, "b.md");
    assert!((results[0].score - 1.0).abs() < 0.01);
    assert_eq!(results[1].target_path, "c.md");
    assert!((results[1].score - 0.5).abs() < 0.01);
}

#[test]
fn shared_property_finds_matching_kv_pairs() {
    let (_tmp, conn) = setup_db();
    let ts = 1_700_000_000_000i64;
    insert_note(&conn, "a.md", "Note A", ts);
    insert_note(&conn, "b.md", "Note B", ts);
    insert_note(&conn, "c.md", "Note C", ts);

    insert_property(&conn, "a.md", "project", "carbide");
    insert_property(&conn, "b.md", "project", "carbide");
    insert_property(&conn, "c.md", "project", "other");

    let groups = vec![SmartLinkRuleGroup {
        id: "metadata".into(),
        name: "Metadata".into(),
        enabled: true,
        rules: vec![SmartLinkRule {
            id: "shared_property".into(),
            name: "Shared properties".into(),
            enabled: true,
            weight: 1.0,
            config: Default::default(),
        }],
    }];

    let results = compute(&conn, "a.md", &groups);
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].target_path, "b.md");
}

#[test]
fn disabled_group_skipped() {
    let (_tmp, conn) = setup_db();
    let ts = 1_700_000_000_000i64;
    insert_note(&conn, "a.md", "Note A", ts);
    insert_note(&conn, "b.md", "Note B", ts);
    insert_tag(&conn, "a.md", "test");
    insert_tag(&conn, "b.md", "test");

    let groups = vec![SmartLinkRuleGroup {
        id: "metadata".into(),
        name: "Metadata".into(),
        enabled: false,
        rules: vec![SmartLinkRule {
            id: "shared_tag".into(),
            name: "Shared tags".into(),
            enabled: true,
            weight: 1.0,
            config: Default::default(),
        }],
    }];

    let results = compute(&conn, "a.md", &groups);
    assert!(results.is_empty());
}

#[test]
fn disabled_rule_skipped() {
    let (_tmp, conn) = setup_db();
    let ts = 1_700_000_000_000i64;
    insert_note(&conn, "a.md", "Note A", ts);
    insert_note(&conn, "b.md", "Note B", ts);
    insert_tag(&conn, "a.md", "test");
    insert_tag(&conn, "b.md", "test");

    let groups = vec![SmartLinkRuleGroup {
        id: "metadata".into(),
        name: "Metadata".into(),
        enabled: true,
        rules: vec![SmartLinkRule {
            id: "shared_tag".into(),
            name: "Shared tags".into(),
            enabled: false,
            weight: 1.0,
            config: Default::default(),
        }],
    }];

    let results = compute(&conn, "a.md", &groups);
    assert!(results.is_empty());
}

#[test]
fn multi_rule_scores_aggregate() {
    let (_tmp, conn) = setup_db();
    let ts = 1_700_000_000_000i64;
    insert_note(&conn, "a.md", "Note A", ts);
    insert_note(&conn, "b.md", "Note B", ts + 3600_000);
    insert_note(&conn, "c.md", "Note C", ts + 86_400_000);

    insert_tag(&conn, "a.md", "rust");
    insert_tag(&conn, "b.md", "rust");
    insert_tag(&conn, "c.md", "rust");

    let groups = vec![SmartLinkRuleGroup {
        id: "metadata".into(),
        name: "Metadata".into(),
        enabled: true,
        rules: vec![
            SmartLinkRule {
                id: "same_day".into(),
                name: "Same day".into(),
                enabled: true,
                weight: 0.3,
                config: Default::default(),
            },
            SmartLinkRule {
                id: "shared_tag".into(),
                name: "Shared tags".into(),
                enabled: true,
                weight: 0.5,
                config: Default::default(),
            },
        ],
    }];

    let results = compute(&conn, "a.md", &groups);
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].target_path, "b.md");
    assert!((results[0].score - 0.8).abs() < 0.01); // 0.3*1.0 + 0.5*1.0
    assert_eq!(results[0].rules.len(), 2);
    assert_eq!(results[1].target_path, "c.md");
    assert!((results[1].score - 0.5).abs() < 0.01); // 0.5*1.0 only (different day)
    assert_eq!(results[1].rules.len(), 1);
}

#[test]
fn no_results_for_missing_note() {
    let (_tmp, conn) = setup_db();
    let groups = default_rules();
    let results = compute(&conn, "nonexistent.md", &groups);
    assert!(results.is_empty());
}

#[test]
fn default_rules_structure() {
    let groups = default_rules();
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].id, "metadata");
    assert_eq!(groups[0].rules.len(), 3);
    let ids: Vec<&str> = groups[0].rules.iter().map(|r| r.id.as_str()).collect();
    assert_eq!(ids, vec!["same_day", "shared_tag", "shared_property"]);
}
