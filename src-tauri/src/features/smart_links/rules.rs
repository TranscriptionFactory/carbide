use super::{SmartLinkRuleGroup, SmartLinkRuleMatch, SmartLinkSuggestion};
use rusqlite::Connection;
use std::collections::HashMap;

struct RuleHit {
    target_path: String,
    target_title: String,
    raw_score: f64,
}

pub fn execute_rules(
    conn: &Connection,
    note_path: &str,
    rule_groups: &[SmartLinkRuleGroup],
    limit: usize,
) -> Result<Vec<SmartLinkSuggestion>, String> {
    let mut hits: HashMap<String, SmartLinkSuggestion> = HashMap::new();

    for group in rule_groups {
        if !group.enabled {
            continue;
        }
        for rule in &group.rules {
            if !rule.enabled {
                continue;
            }
            let rule_hits = match rule.id.as_str() {
                "same_day" => query_same_day(conn, note_path)?,
                "shared_tag" => query_shared_tag(conn, note_path)?,
                "shared_property" => query_shared_property(conn, note_path)?,
                _ => continue,
            };

            for hit in rule_hits {
                let entry = hits.entry(hit.target_path.clone()).or_insert_with(|| {
                    SmartLinkSuggestion {
                        target_path: hit.target_path.clone(),
                        target_title: hit.target_title.clone(),
                        score: 0.0,
                        rules: Vec::new(),
                    }
                });
                entry.score += rule.weight * hit.raw_score;
                entry.rules.push(SmartLinkRuleMatch {
                    rule_id: rule.id.clone(),
                    raw_score: hit.raw_score,
                });
            }
        }
    }

    let mut results: Vec<SmartLinkSuggestion> = hits.into_values().collect();
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(limit);
    Ok(results)
}

fn query_same_day(conn: &Connection, note_path: &str) -> Result<Vec<RuleHit>, String> {
    let sql = "
        SELECT n2.path, n2.title
        FROM notes n1
        JOIN notes n2 ON date(n1.mtime_ms / 1000, 'unixepoch') = date(n2.mtime_ms / 1000, 'unixepoch')
        WHERE n1.path = ?1 AND n2.path != ?1
        LIMIT 50
    ";
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([note_path], |row| {
            Ok(RuleHit {
                target_path: row.get(0)?,
                target_title: row.get(1)?,
                raw_score: 1.0,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn query_shared_tag(conn: &Connection, note_path: &str) -> Result<Vec<RuleHit>, String> {
    let sql = "
        SELECT n.path, n.title, COUNT(DISTINCT t2.tag) as shared_count,
               (SELECT COUNT(DISTINCT tag) FROM note_inline_tags WHERE path = ?1) as source_count
        FROM note_inline_tags t1
        JOIN note_inline_tags t2 ON t1.tag = t2.tag AND t2.path != ?1
        JOIN notes n ON n.path = t2.path
        WHERE t1.path = ?1
        GROUP BY n.path
        ORDER BY shared_count DESC
        LIMIT 50
    ";
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([note_path], |row| {
            let shared: f64 = row.get(2)?;
            let source: f64 = row.get(3)?;
            let score = if source > 0.0 { shared / source } else { 0.0 };
            Ok(RuleHit {
                target_path: row.get(0)?,
                target_title: row.get(1)?,
                raw_score: score,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn query_shared_property(conn: &Connection, note_path: &str) -> Result<Vec<RuleHit>, String> {
    let sql = "
        SELECT n.path, n.title, COUNT(DISTINCT p1.key || '=' || p1.value) as shared_count,
               (SELECT COUNT(*) FROM note_properties WHERE path = ?1) as source_count
        FROM note_properties p1
        JOIN note_properties p2 ON p1.key = p2.key AND p1.value = p2.value AND p2.path != ?1
        JOIN notes n ON n.path = p2.path
        WHERE p1.path = ?1
        GROUP BY n.path
        ORDER BY shared_count DESC
        LIMIT 50
    ";
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([note_path], |row| {
            let shared: f64 = row.get(2)?;
            let source: f64 = row.get(3)?;
            let score = if source > 0.0 { shared / source } else { 0.0 };
            Ok(RuleHit {
                target_path: row.get(0)?,
                target_title: row.get(1)?,
                raw_score: score,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}
