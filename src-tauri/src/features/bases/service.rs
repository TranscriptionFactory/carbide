use crate::features::notes::service as notes_service;
use crate::features::search::db as search_db;
use crate::features::search::model::{
    BaseFilter, BaseQuery, BaseQueryResults, BaseSort, PropertyInfo,
};
use crate::features::search::service as search_service;
use crate::shared::storage;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashSet;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct KanbanConfig {
    pub group_by: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub column_order: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct CalendarConfig {
    pub date_property: String,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct TreeConfig {
    pub group_by: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date_format: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct BaseViewDefinition {
    pub name: String,
    pub query: BaseQuery,
    pub view_mode: String, // "table" | "list" | "kanban" | "gallery" | "calendar" | "tree"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kanban_config: Option<KanbanConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar_config: Option<CalendarConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tree_config: Option<TreeConfig>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct SavedViewInfo {
    pub name: String,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub fn bases_list_properties(
    app: AppHandle,
    vault_id: String,
) -> Result<Vec<PropertyInfo>, String> {
    search_service::with_read_conn(&app, &vault_id, |conn| search_db::list_all_properties(conn))
}

#[tauri::command]
#[specta::specta]
pub fn bases_query(
    app: AppHandle,
    vault_id: String,
    query: BaseQuery,
) -> Result<BaseQueryResults, String> {
    search_service::with_read_conn(&app, &vault_id, |conn| search_db::query_bases(conn, query))
}

#[tauri::command]
#[specta::specta]
pub fn bases_count_many(
    app: AppHandle,
    vault_id: String,
    queries: Vec<BaseQuery>,
) -> Result<Vec<u32>, String> {
    search_service::with_read_conn(&app, &vault_id, |conn| {
        search_db::count_bases_many(conn, &queries)
    })
}

#[tauri::command]
#[specta::specta]
pub fn bases_save_view(
    app: AppHandle,
    vault_id: String,
    path: String,
    view: BaseViewDefinition,
) -> Result<(), String> {
    if storage::vault_mode_for_id(&app, &vault_id)? == storage::VaultMode::Browse {
        return Err("not available in browse mode".to_string());
    }
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = notes_service::safe_vault_abs_for_write(&root, &path)?;

    let json = serde_json::to_string_pretty(&view).map_err(|e| e.to_string())?;

    crate::shared::io_utils::atomic_write(&abs, json.as_bytes())?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn bases_load_view(
    app: AppHandle,
    vault_id: String,
    path: String,
) -> Result<BaseViewDefinition, String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = notes_service::safe_vault_abs(&root, &path)?;

    let content = std::fs::read_to_string(abs).map_err(|e| e.to_string())?;
    let view: BaseViewDefinition = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    Ok(view)
}

#[tauri::command]
#[specta::specta]
pub fn bases_list_views(app: AppHandle, vault_id: String) -> Result<Vec<SavedViewInfo>, String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let dir = root.join(".carbide").join("bases");
    if !dir.is_dir() {
        return Ok(vec![]);
    }

    let mut views = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(view) = serde_json::from_str::<BaseViewDefinition>(&content) {
                let rel = PathBuf::from(".carbide")
                    .join("bases")
                    .join(entry.file_name());
                views.push(SavedViewInfo {
                    name: view.name,
                    path: rel.to_string_lossy().into_owned(),
                    icon: view.icon,
                    color: view.color,
                });
            }
        }
    }

    Ok(views)
}

#[tauri::command]
#[specta::specta]
pub fn bases_delete_view(app: AppHandle, vault_id: String, path: String) -> Result<(), String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = notes_service::safe_vault_abs(&root, &path)?;

    if abs.is_file() {
        std::fs::remove_file(abs).map_err(|e| e.to_string())?;
    }

    Ok(())
}

const SEED_SENTINEL: &str = ".seeded";

fn slugify(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut prev_dash = false;
    for ch in name.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

fn default_seed_views() -> Vec<(BaseViewDefinition, Option<&'static str>)> {
    fn q(filters: Vec<BaseFilter>, sort: Vec<BaseSort>) -> BaseQuery {
        BaseQuery {
            filters,
            sort,
            limit: 100,
            offset: 0,
        }
    }

    vec![
        (
            BaseViewDefinition {
                name: "By Tag".into(),
                query: q(vec![], vec![]),
                view_mode: "tree".into(),
                icon: None,
                color: None,
                kanban_config: None,
                calendar_config: None,
                tree_config: Some(TreeConfig {
                    group_by: vec!["tags".into()],
                    date_format: None,
                }),
            },
            None,
        ),
        (
            BaseViewDefinition {
                name: "By Created Month".into(),
                query: q(vec![], vec![]),
                view_mode: "tree".into(),
                icon: None,
                color: None,
                kanban_config: None,
                calendar_config: None,
                tree_config: Some(TreeConfig {
                    group_by: vec!["created".into()],
                    date_format: Some("YYYY/MM".into()),
                }),
            },
            Some("created"),
        ),
        (
            BaseViewDefinition {
                name: "By Status".into(),
                query: q(vec![], vec![]),
                view_mode: "tree".into(),
                icon: None,
                color: None,
                kanban_config: None,
                calendar_config: None,
                tree_config: Some(TreeConfig {
                    group_by: vec!["status".into()],
                    date_format: None,
                }),
            },
            Some("status"),
        ),
        (
            BaseViewDefinition {
                name: "Modified This Week".into(),
                query: q(
                    vec![BaseFilter {
                        property: "modified".into(),
                        operator: "gt".into(),
                        value: "now()-7d".into(),
                    }],
                    vec![BaseSort {
                        property: "modified".into(),
                        descending: true,
                    }],
                ),
                view_mode: "list".into(),
                icon: None,
                color: None,
                kanban_config: None,
                calendar_config: None,
                tree_config: None,
            },
            None,
        ),
        (
            BaseViewDefinition {
                name: "Orphan Notes".into(),
                query: q(
                    vec![BaseFilter {
                        property: "backlink_count".into(),
                        operator: "eq".into(),
                        value: "0".into(),
                    }],
                    vec![],
                ),
                view_mode: "list".into(),
                icon: None,
                color: None,
                kanban_config: None,
                calendar_config: None,
                tree_config: None,
            },
            Some("backlink_count"),
        ),
        (
            BaseViewDefinition {
                name: "Smart Archive".into(),
                query: q(
                    vec![BaseFilter {
                        property: "accessed".into(),
                        operator: "lt".into(),
                        value: "now()-30d".into(),
                    }],
                    vec![],
                ),
                view_mode: "list".into(),
                icon: None,
                color: None,
                kanban_config: None,
                calendar_config: None,
                tree_config: None,
            },
            None,
        ),
    ]
}

#[tauri::command]
#[specta::specta]
pub fn bases_seed_default_views(app: AppHandle, vault_id: String) -> Result<u32, String> {
    if storage::vault_mode_for_id(&app, &vault_id)? == storage::VaultMode::Browse {
        return Ok(0);
    }
    let root = storage::vault_path(&app, &vault_id)?;
    let dir = root.join(".carbide").join("bases");
    let sentinel = dir.join(SEED_SENTINEL);
    if sentinel.exists() {
        return Ok(0);
    }

    let available: HashSet<String> = search_service::with_read_conn(&app, &vault_id, |conn| {
        search_db::list_all_properties(conn)
    })?
    .into_iter()
    .map(|p: PropertyInfo| p.name)
    .collect();

    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut written = 0u32;
    for (view, required_property) in default_seed_views() {
        if let Some(prop) = required_property {
            if !available.contains(prop) {
                continue;
            }
        }
        let slug = slugify(&view.name);
        let file = dir.join(format!("{}.json", slug));
        if file.exists() {
            continue;
        }
        let json = serde_json::to_string_pretty(&view).map_err(|e| e.to_string())?;
        crate::shared::io_utils::atomic_write(&file, json.as_bytes())?;
        written += 1;
    }

    crate::shared::io_utils::atomic_write(&sentinel, b"")?;
    Ok(written)
}

#[tauri::command]
#[specta::specta]
pub fn bases_update_property(
    app: AppHandle,
    vault_id: String,
    note_path: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = notes_service::safe_vault_abs_for_write(&root, &note_path)?;
    let content = crate::shared::io_utils::read_file_to_string(&abs)?;

    let updated = update_frontmatter_key(&content, &key, &value)?;
    crate::shared::io_utils::atomic_write(&abs, updated.as_bytes())?;

    search_service::index_upsert_note_with_content(&app, &vault_id, &note_path, updated)?;

    Ok(())
}

fn update_frontmatter_key(markdown: &str, key: &str, value: &str) -> Result<String, String> {
    let lines: Vec<&str> = markdown.lines().collect();
    if lines.is_empty() || lines[0].trim() != "---" {
        return Err("Note has no frontmatter block".to_string());
    }

    let end_idx = lines
        .iter()
        .enumerate()
        .skip(1)
        .find(|(_, l)| l.trim() == "---")
        .map(|(i, _)| i)
        .ok_or("Malformed frontmatter: no closing ---")?;

    let key_prefix = format!("{}:", key);
    let trailing_newline = markdown.ends_with('\n');

    for i in 1..end_idx {
        if lines[i].starts_with(&key_prefix) {
            let indent = &lines[i][..lines[i].len() - lines[i].trim_start().len()];
            let new_line = format!("{}{}: {}", indent, key, value);
            // Skip any continuation lines (array items)
            let mut skip_end = i + 1;
            while skip_end < end_idx
                && (lines[skip_end].starts_with("  - ") || lines[skip_end].starts_with("\t- "))
            {
                skip_end += 1;
            }
            let mut out: Vec<String> = lines[..i].iter().map(|s| s.to_string()).collect();
            out.push(new_line);
            out.extend(lines[skip_end..].iter().map(|s| s.to_string()));
            let mut result = out.join("\n");
            if trailing_newline && !result.ends_with('\n') {
                result.push('\n');
            }
            return Ok(result);
        }
    }

    // Key doesn't exist — insert before closing ---
    let new_line = format!("{}: {}", key, value);
    let mut out: Vec<String> = lines[..end_idx].iter().map(|s| s.to_string()).collect();
    out.push(new_line);
    out.extend(lines[end_idx..].iter().map(|s| s.to_string()));
    let mut result = out.join("\n");
    if trailing_newline && !result.ends_with('\n') {
        result.push('\n');
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_keeps_alphanumerics_and_collapses_separators() {
        assert_eq!(slugify("By Tag"), "by-tag");
        assert_eq!(slugify("Modified This Week"), "modified-this-week");
        assert_eq!(slugify("  trailing  "), "trailing");
        assert_eq!(slugify("a/b__c"), "a-b-c");
    }

    #[test]
    fn default_seeds_cover_planned_views() {
        let seeds = default_seed_views();
        let names: Vec<&str> = seeds.iter().map(|(v, _)| v.name.as_str()).collect();
        assert_eq!(
            names,
            vec![
                "By Tag",
                "By Created Month",
                "By Status",
                "Modified This Week",
                "Orphan Notes",
                "Smart Archive",
            ]
        );
    }

    #[test]
    fn by_tag_seed_has_no_required_property_and_uses_tree_mode() {
        let seeds = default_seed_views();
        let (view, required) = &seeds[0];
        assert_eq!(view.name, "By Tag");
        assert!(required.is_none(), "tags seed should always apply");
        assert_eq!(view.view_mode, "tree");
        let tree = view.tree_config.as_ref().expect("tree_config required");
        assert_eq!(tree.group_by, vec!["tags"]);
    }

    #[test]
    fn by_created_month_seed_uses_date_format() {
        let (view, required) = default_seed_views().into_iter().nth(1).unwrap();
        assert_eq!(view.name, "By Created Month");
        assert_eq!(required, Some("created"));
        let tree = view.tree_config.as_ref().expect("tree_config required");
        assert_eq!(tree.group_by, vec!["created"]);
        assert_eq!(tree.date_format.as_deref(), Some("YYYY/MM"));
    }

    #[test]
    fn modified_this_week_seed_filters_and_sorts() {
        let (view, required) = default_seed_views().into_iter().nth(3).unwrap();
        assert_eq!(view.name, "Modified This Week");
        assert!(
            required.is_none(),
            "modified seed resolves to mtime_ms, so it always applies"
        );
        assert_eq!(view.query.filters.len(), 1);
        let filter = &view.query.filters[0];
        assert_eq!(filter.property, "modified");
        assert_eq!(filter.operator, "gt");
        assert_eq!(filter.value, "now()-7d");
        assert_eq!(view.query.sort[0].property, "modified");
        assert!(view.query.sort[0].descending);
    }
}
