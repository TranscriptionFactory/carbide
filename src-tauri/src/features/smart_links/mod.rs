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
    #[serde(default)]
    pub config: std::collections::HashMap<String, String>,
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
                    config: Default::default(),
                },
                SmartLinkRule {
                    id: "shared_tag".into(),
                    name: "Shared tags".into(),
                    enabled: true,
                    weight: 0.5,
                    config: Default::default(),
                },
                SmartLinkRule {
                    id: "shared_property".into(),
                    name: "Shared properties".into(),
                    enabled: true,
                    weight: 0.4,
                    config: Default::default(),
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
                    config: Default::default(),
                },
                SmartLinkRule {
                    id: "title_overlap".into(),
                    name: "Title overlap".into(),
                    enabled: false,
                    weight: 0.3,
                    config: Default::default(),
                },
                SmartLinkRule {
                    id: "shared_outlinks".into(),
                    name: "Shared outlinks".into(),
                    enabled: false,
                    weight: 0.4,
                    config: Default::default(),
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

    search_service::with_read_conn(&app, &vault_id, |conn| {
        execute_rules(conn, &note_path, &rule_groups, limit)
    })
}
