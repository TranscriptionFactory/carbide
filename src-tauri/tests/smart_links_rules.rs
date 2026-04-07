use crate::features::search::db::open_search_db_at_path;
use crate::features::search::vector_db;
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

fn insert_outlink(conn: &rusqlite::Connection, source: &str, target: &str) {
    conn.execute(
        "INSERT OR REPLACE INTO outlinks (source_path, target_path) VALUES (?1, ?2)",
        params![source, target],
    )
    .expect("insert outlink");
}

fn setup_db_with_vectors() -> (TempDir, rusqlite::Connection) {
    let (tmp, conn) = setup_db();
    vector_db::init_vector_schema(&conn).expect("init vector schema");
    (tmp, conn)
}

fn make_rule_group(rule_id: &str, weight: f64) -> Vec<SmartLinkRuleGroup> {
    vec![SmartLinkRuleGroup {
        id: "test".into(),
        name: "Test".into(),
        enabled: true,
        rules: vec![SmartLinkRule {
            id: rule_id.into(),
            name: rule_id.into(),
            enabled: true,
            weight,
        }],
    }]
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
            },
            SmartLinkRule {
                id: "shared_tag".into(),
                name: "Shared tags".into(),
                enabled: true,
                weight: 0.5,
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
    assert_eq!(groups.len(), 2);
    assert_eq!(groups[0].id, "metadata");
    assert_eq!(groups[0].rules.len(), 3);
    let meta_ids: Vec<&str> = groups[0].rules.iter().map(|r| r.id.as_str()).collect();
    assert_eq!(meta_ids, vec!["same_day", "shared_tag", "shared_property"]);
    assert_eq!(groups[1].id, "semantic");
    assert_eq!(groups[1].rules.len(), 3);
    let sem_ids: Vec<&str> = groups[1].rules.iter().map(|r| r.id.as_str()).collect();
    assert_eq!(
        sem_ids,
        vec!["semantic_similarity", "title_overlap", "shared_outlinks"]
    );
}

#[test]
fn semantic_similarity_returns_similar_notes() {
    let (_tmp, conn) = setup_db_with_vectors();
    let ts = 1_700_000_000_000i64;
    insert_note(&conn, "a.md", "Note A", ts);
    insert_note(&conn, "b.md", "Note B", ts);
    insert_note(&conn, "c.md", "Note C", ts);

    let vec_a = vec![1.0f32, 0.0, 0.0];
    let vec_b = vec![0.9, 0.1, 0.0];
    let vec_c = vec![0.0, 0.0, 1.0];
    vector_db::upsert_embedding(&conn, "a.md", &vec_a).expect("upsert a");
    vector_db::upsert_embedding(&conn, "b.md", &vec_b).expect("upsert b");
    vector_db::upsert_embedding(&conn, "c.md", &vec_c).expect("upsert c");

    let groups = make_rule_group("semantic_similarity", 1.0);
    let results = compute(&conn, "a.md", &groups);
    assert!(!results.is_empty());
    assert_eq!(results[0].target_path, "b.md");
    assert_eq!(results[0].rules[0].rule_id, "semantic_similarity");
    assert!(results[0].rules[0].raw_score > 0.5);
}

#[test]
fn semantic_similarity_returns_empty_without_embedding() {
    let (_tmp, conn) = setup_db_with_vectors();
    let ts = 1_700_000_000_000i64;
    insert_note(&conn, "a.md", "Note A", ts);
    insert_note(&conn, "b.md", "Note B", ts);

    let groups = make_rule_group("semantic_similarity", 1.0);
    let results = compute(&conn, "a.md", &groups);
    assert!(results.is_empty());
}

#[test]
fn title_overlap_finds_similar_titles() {
    let (_tmp, conn) = setup_db();
    let ts = 1_700_000_000_000i64;
    insert_note(&conn, "a.md", "Rust Programming Guide", ts);
    insert_note(&conn, "b.md", "Rust Programming Tutorial", ts);
    insert_note(&conn, "c.md", "Python Data Science", ts);

    let groups = make_rule_group("title_overlap", 1.0);
    let results = compute(&conn, "a.md", &groups);
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].target_path, "b.md");
    assert_eq!(results[0].rules[0].rule_id, "title_overlap");
    assert!(results[0].rules[0].raw_score > 0.3);
}

#[test]
fn title_overlap_excludes_low_similarity() {
    let (_tmp, conn) = setup_db();
    let ts = 1_700_000_000_000i64;
    insert_note(&conn, "a.md", "Rust Programming", ts);
    insert_note(&conn, "b.md", "Cooking Recipes", ts);

    let groups = make_rule_group("title_overlap", 1.0);
    let results = compute(&conn, "a.md", &groups);
    assert!(results.is_empty());
}

#[test]
fn shared_outlinks_finds_notes_with_common_targets() {
    let (_tmp, conn) = setup_db();
    let ts = 1_700_000_000_000i64;
    insert_note(&conn, "a.md", "Note A", ts);
    insert_note(&conn, "b.md", "Note B", ts);
    insert_note(&conn, "c.md", "Note C", ts);
    insert_note(&conn, "target1.md", "Target 1", ts);
    insert_note(&conn, "target2.md", "Target 2", ts);

    insert_outlink(&conn, "a.md", "target1.md");
    insert_outlink(&conn, "a.md", "target2.md");
    insert_outlink(&conn, "b.md", "target1.md");
    insert_outlink(&conn, "b.md", "target2.md");
    insert_outlink(&conn, "c.md", "target1.md");

    let groups = make_rule_group("shared_outlinks", 1.0);
    let results = compute(&conn, "a.md", &groups);
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].target_path, "b.md");
    assert!((results[0].score - 1.0).abs() < 0.01);
    assert_eq!(results[1].target_path, "c.md");
    assert!((results[1].score - 0.5).abs() < 0.01);
}

#[test]
fn shared_outlinks_empty_when_no_outlinks() {
    let (_tmp, conn) = setup_db();
    let ts = 1_700_000_000_000i64;
    insert_note(&conn, "a.md", "Note A", ts);
    insert_note(&conn, "b.md", "Note B", ts);

    let groups = make_rule_group("shared_outlinks", 1.0);
    let results = compute(&conn, "a.md", &groups);
    assert!(results.is_empty());
}

#[test]
fn cross_group_aggregation_metadata_plus_semantic() {
    let (_tmp, conn) = setup_db_with_vectors();
    let ts = 1_700_000_000_000i64;
    insert_note(&conn, "a.md", "Note A", ts);
    insert_note(&conn, "b.md", "Note B", ts);

    insert_tag(&conn, "a.md", "rust");
    insert_tag(&conn, "b.md", "rust");

    let vec_a = vec![1.0f32, 0.0, 0.0];
    let vec_b = vec![0.95, 0.05, 0.0];
    vector_db::upsert_embedding(&conn, "a.md", &vec_a).expect("upsert a");
    vector_db::upsert_embedding(&conn, "b.md", &vec_b).expect("upsert b");

    let groups = vec![
        SmartLinkRuleGroup {
            id: "metadata".into(),
            name: "Metadata".into(),
            enabled: true,
            rules: vec![SmartLinkRule {
                id: "shared_tag".into(),
                name: "Shared tags".into(),
                enabled: true,
                weight: 0.5,
            }],
        },
        SmartLinkRuleGroup {
            id: "semantic".into(),
            name: "Semantic".into(),
            enabled: true,
            rules: vec![SmartLinkRule {
                id: "semantic_similarity".into(),
                name: "Semantic".into(),
                enabled: true,
                weight: 0.6,
            }],
        },
    ];

    let results = compute(&conn, "a.md", &groups);
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].target_path, "b.md");
    assert_eq!(results[0].rules.len(), 2);
    let rule_ids: Vec<&str> = results[0]
        .rules
        .iter()
        .map(|r| r.rule_id.as_str())
        .collect();
    assert!(rule_ids.contains(&"shared_tag"));
    assert!(rule_ids.contains(&"semantic_similarity"));
    assert!(results[0].score > 0.5);
}
