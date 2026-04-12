pub(crate) mod config;
pub(crate) mod rules;

use crate::features::search::service as search_service;
use crate::shared::storage;
use rules::execute_rules;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
#[serde(rename_all = "camelCase")]
pub struct SmartLinkRule {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub weight: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
#[serde(rename_all = "camelCase")]
pub struct SmartLinkRuleGroup {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub rules: Vec<SmartLinkRule>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
#[serde(rename_all = "camelCase")]
pub struct SmartLinkRuleMatch {
    pub rule_id: String,
    pub raw_score: f64,
}

#[derive(Debug, Serialize, Clone, Type)]
#[serde(rename_all = "camelCase")]
pub struct SmartLinkSuggestion {
    pub target_path: String,
    pub target_title: String,
    pub score: f64,
    pub rules: Vec<SmartLinkRuleMatch>,
}

#[derive(Debug, Serialize, Clone, Type)]
#[serde(rename_all = "camelCase")]
pub struct SmartLinkEdge {
    pub source_path: String,
    pub target_path: String,
    pub score: f64,
    pub rules: Vec<SmartLinkRuleMatch>,
}

pub(crate) fn default_rules() -> Vec<SmartLinkRuleGroup> {
    vec![
        SmartLinkRuleGroup {
            id: "metadata".into(),
            name: "Metadata Rules".into(),
            enabled: true,
            rules: vec![
                SmartLinkRule {
                    id: "same_day".into(),
                    name: "Same day creation/modification".into(),
                    enabled: true,
                    weight: 0.3,
                },
                SmartLinkRule {
                    id: "shared_tag".into(),
                    name: "Shared tags".into(),
                    enabled: true,
                    weight: 0.5,
                },
                SmartLinkRule {
                    id: "shared_property".into(),
                    name: "Shared properties".into(),
                    enabled: true,
                    weight: 0.4,
                },
            ],
        },
        SmartLinkRuleGroup {
            id: "semantic".into(),
            name: "Semantic Rules".into(),
            enabled: true,
            rules: vec![
                SmartLinkRule {
                    id: "semantic_similarity".into(),
                    name: "Semantic similarity".into(),
                    enabled: true,
                    weight: 0.6,
                },
                SmartLinkRule {
                    id: "title_overlap".into(),
                    name: "Title overlap".into(),
                    enabled: false,
                    weight: 0.3,
                },
                SmartLinkRule {
                    id: "shared_outlinks".into(),
                    name: "Shared outlinks".into(),
                    enabled: false,
                    weight: 0.4,
                },
                SmartLinkRule {
                    id: "block_semantic_similarity".into(),
                    name: "Block-level semantic similarity".into(),
                    enabled: false,
                    weight: 0.5,
                },
            ],
        },
    ]
}

#[tauri::command]
#[specta::specta]
pub fn smart_links_load_rules(
    app: AppHandle,
    vault_id: String,
) -> Result<Vec<SmartLinkRuleGroup>, String> {
    let root = storage::vault_path(&app, &vault_id)?;
    config::load_rules(&root)
}

#[tauri::command]
#[specta::specta]
pub fn smart_links_save_rules(
    app: AppHandle,
    vault_id: String,
    rules: Vec<SmartLinkRuleGroup>,
) -> Result<(), String> {
    let root = storage::vault_path(&app, &vault_id)?;
    config::save_rules(&root, &rules)
}

#[tauri::command]
#[specta::specta]
pub fn smart_links_compute_suggestions(
    app: AppHandle,
    vault_id: String,
    note_path: String,
    limit: Option<usize>,
) -> Result<Vec<SmartLinkSuggestion>, String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let rule_groups = config::load_rules(&root)?;
    let limit = limit.unwrap_or(20).min(100);

    let (ni, bi) = search_service::get_index_arcs(&app, &vault_id)?;
    let ni_guard = ni.read().map_err(|e| e.to_string())?;
    let bi_guard = bi.read().map_err(|e| e.to_string())?;

    search_service::with_read_conn(&app, &vault_id, |conn| {
        execute_rules(conn, &note_path, &rule_groups, limit, &ni_guard, &bi_guard)
    })
}

#[tauri::command]
#[specta::specta]
pub fn smart_links_compute_vault_edges(
    app: AppHandle,
    vault_id: String,
    min_score: Option<f64>,
    per_note_limit: Option<usize>,
) -> Result<Vec<SmartLinkEdge>, String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let rule_groups = config::load_rules(&root)?;
    let limit = per_note_limit.unwrap_or(5).min(20);
    let threshold = min_score.unwrap_or(0.1);

    let (ni, bi) = search_service::get_index_arcs(&app, &vault_id)?;
    let ni_guard = ni.read().map_err(|e| e.to_string())?;
    let bi_guard = bi.read().map_err(|e| e.to_string())?;

    search_service::with_read_conn(&app, &vault_id, |conn| {
        let manifest = crate::features::search::db::get_manifest(conn)?;
        let note_paths: Vec<String> = manifest.into_keys().collect();

        let mut seen = std::collections::HashSet::new();
        let mut edges = Vec::new();

        for source_path in &note_paths {
            let suggestions =
                execute_rules(conn, source_path, &rule_groups, limit, &ni_guard, &bi_guard)?;

            for s in suggestions {
                if s.score < threshold {
                    continue;
                }
                let key = if source_path.as_str() < s.target_path.as_str() {
                    format!("{}|{}", source_path, s.target_path)
                } else {
                    format!("{}|{}", s.target_path, source_path)
                };
                if seen.contains(&key) {
                    continue;
                }
                seen.insert(key);
                edges.push(SmartLinkEdge {
                    source_path: source_path.clone(),
                    target_path: s.target_path,
                    score: s.score,
                    rules: s.rules,
                });
            }
        }

        edges.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        Ok(edges)
    })
}
