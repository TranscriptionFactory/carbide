use super::{SmartLinkRuleGroup, SmartLinkRuleMatch, SmartLinkSuggestion};
use crate::features::search::hnsw_index::VectorIndex;
use crate::features::search::vector_db;
use rusqlite::Connection;
use std::collections::{HashMap, HashSet};

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
    note_index: &VectorIndex,
    block_index: &VectorIndex,
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
                "semantic_similarity" => query_semantic_similarity(conn, note_path, note_index)?,
                "title_overlap" => query_title_overlap(conn, note_path)?,
                "shared_outlinks" => query_shared_outlinks(conn, note_path)?,
                "block_semantic_similarity" => {
                    query_block_semantic_similarity(conn, note_path, note_index, block_index)?
                }
                _ => continue,
            };

            for hit in rule_hits {
                let entry =
                    hits.entry(hit.target_path.clone())
                        .or_insert_with(|| SmartLinkSuggestion {
                            target_path: hit.target_path.clone(),
                            target_title: hit.target_title.clone(),
                            score: 0.0,
                            rules: Vec::new(),
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
    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
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

fn query_semantic_similarity(
    conn: &Connection,
    note_path: &str,
    note_index: &VectorIndex,
) -> Result<Vec<RuleHit>, String> {
    let query_vec = match note_index.get_vector(note_path) {
        Some(v) => v.clone(),
        None => return Ok(vec![]),
    };

    let knn_results = note_index.search(&query_vec, 51);

    let mut hits = Vec::new();
    for (path, distance) in knn_results {
        if path == note_path {
            continue;
        }
        let similarity = (1.0 - distance) as f64;
        if similarity <= 0.0 {
            continue;
        }
        let title: String = conn
            .query_row("SELECT title FROM notes WHERE path = ?1", [&path], |row| {
                row.get(0)
            })
            .unwrap_or_default();
        hits.push(RuleHit {
            target_path: path,
            target_title: title,
            raw_score: similarity,
        });
    }
    hits.truncate(50);
    Ok(hits)
}

fn tokenize_title(title: &str) -> HashSet<String> {
    title
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() >= 2)
        .map(String::from)
        .collect()
}

fn query_title_overlap(conn: &Connection, note_path: &str) -> Result<Vec<RuleHit>, String> {
    let source_title: String = conn
        .query_row(
            "SELECT title FROM notes WHERE path = ?1",
            [note_path],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let source_tokens = tokenize_title(&source_title);
    if source_tokens.is_empty() {
        return Ok(vec![]);
    }

    let sql = "SELECT path, title FROM notes WHERE path != ?1";
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([note_path], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut hits = Vec::new();
    for row in rows {
        let (path, title) = row.map_err(|e| e.to_string())?;
        let target_tokens = tokenize_title(&title);
        if target_tokens.is_empty() {
            continue;
        }
        let intersection = source_tokens.intersection(&target_tokens).count();
        if intersection == 0 {
            continue;
        }
        let union = source_tokens.union(&target_tokens).count();
        let jaccard = intersection as f64 / union as f64;
        if jaccard >= 0.15 {
            hits.push(RuleHit {
                target_path: path,
                target_title: title,
                raw_score: jaccard,
            });
        }
    }
    hits.sort_by(|a, b| {
        b.raw_score
            .partial_cmp(&a.raw_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    hits.truncate(50);
    Ok(hits)
}

fn query_shared_outlinks(conn: &Connection, note_path: &str) -> Result<Vec<RuleHit>, String> {
    let sql = "
        SELECT n.path, n.title, COUNT(DISTINCT o1.target_path) as shared_count,
               (SELECT COUNT(DISTINCT target_path) FROM outlinks WHERE source_path = ?1) as source_count
        FROM outlinks o1
        JOIN outlinks o2 ON o1.target_path = o2.target_path AND o2.source_path != ?1
        JOIN notes n ON n.path = o2.source_path
        WHERE o1.source_path = ?1
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

fn query_block_semantic_similarity(
    conn: &Connection,
    note_path: &str,
    note_index: &VectorIndex,
    block_index: &VectorIndex,
) -> Result<Vec<RuleHit>, String> {
    let source_blocks = vector_db::get_block_embeddings_for_note(conn, note_path);
    if source_blocks.is_empty() {
        return Ok(vec![]);
    }

    let candidate_paths: Vec<String> = match note_index.get_vector(note_path) {
        Some(note_vec) => note_index
            .search(note_vec, 50)
            .into_iter()
            .filter(|(p, _)| p != note_path)
            .map(|(p, _)| p)
            .collect(),
        None => {
            let mut stmt = conn
                .prepare("SELECT DISTINCT path FROM block_embeddings WHERE path != ?1")
                .map_err(|e| e.to_string())?;
            let paths: Vec<String> = stmt
                .query_map([note_path], |row| row.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();
            paths
        }
    };

    let mut best_by_path: HashMap<String, f64> = HashMap::new();
    for candidate_path in &candidate_paths {
        for (_, source_vec) in &source_blocks {
            let target_blocks = vector_db::get_block_embeddings_for_note(conn, candidate_path);
            for (_, target_vec) in &target_blocks {
                let sim = (1.0 - vector_db::dot_distance(source_vec, target_vec)) as f64;
                if sim > 0.0 {
                    let entry = best_by_path.entry(candidate_path.clone()).or_insert(0.0);
                    if sim > *entry {
                        *entry = sim;
                    }
                }
            }
        }
    }

    // Also search directly in block index for each source block
    for (_, source_vec) in &source_blocks {
        let block_hits = block_index.search(source_vec, 20);
        for (composite_key, distance) in block_hits {
            if let Some(path) = composite_key.split('\0').next() {
                if path == note_path {
                    continue;
                }
                let sim = (1.0 - distance) as f64;
                if sim > 0.0 {
                    let entry = best_by_path.entry(path.to_string()).or_insert(0.0);
                    if sim > *entry {
                        *entry = sim;
                    }
                }
            }
        }
    }

    let mut hits: Vec<RuleHit> = best_by_path
        .into_iter()
        .map(|(path, score)| {
            let title: String = conn
                .query_row("SELECT title FROM notes WHERE path = ?1", [&path], |row| {
                    row.get(0)
                })
                .unwrap_or_default();
            RuleHit {
                target_path: path,
                target_title: title,
                raw_score: score,
            }
        })
        .collect();

    hits.sort_by(|a, b| {
        b.raw_score
            .partial_cmp(&a.raw_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    hits.truncate(50);
    Ok(hits)
}
