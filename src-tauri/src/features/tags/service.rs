use crate::features::search::service::with_read_conn;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;

#[derive(Debug, Serialize, Type)]
pub struct TagInfo {
    pub tag: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Type)]
pub struct UnifiedTagInfo {
    pub tag: String,
    pub frontmatter_count: i64,
    pub inline_count: i64,
    pub total_count: i64,
}

#[derive(Debug, Serialize, Type)]
pub struct SectionInfo {
    pub heading_id: String,
    pub level: i64,
    pub title: String,
    pub start_line: i64,
    pub end_line: i64,
    pub word_count: i64,
}

#[derive(Debug, Serialize, Type)]
pub struct PropertyRegistryEntry {
    pub key: String,
    pub inferred_type: String,
    pub note_count: i64,
}

#[tauri::command]
#[specta::specta]
pub fn tags_list_all(app: AppHandle, vault_id: String) -> Result<Vec<TagInfo>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT tag, COUNT(DISTINCT path) as cnt FROM note_inline_tags GROUP BY tag ORDER BY cnt DESC, tag ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(TagInfo {
                    tag: row.get(0)?,
                    count: row.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
#[specta::specta]
pub fn tags_list_all_unified(
    app: AppHandle,
    vault_id: String,
) -> Result<Vec<UnifiedTagInfo>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT tag,
                        COUNT(DISTINCT CASE WHEN source = 'frontmatter' THEN path END) as fm,
                        COUNT(DISTINCT CASE WHEN source = 'inline' THEN path END) as inl,
                        COUNT(DISTINCT path) as total
                 FROM note_inline_tags
                 GROUP BY tag
                 ORDER BY total DESC, tag ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(UnifiedTagInfo {
                    tag: row.get(0)?,
                    frontmatter_count: row.get(1)?,
                    inline_count: row.get(2)?,
                    total_count: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    })
}

fn query_notes_by_tag(
    conn: &rusqlite::Connection,
    tag: &str,
    source: Option<&str>,
    prefix: bool,
) -> Result<Vec<String>, String> {
    let tag_condition = if prefix {
        "(tag = ?1 OR tag LIKE ?2)"
    } else {
        "tag = ?1"
    };

    let mut bind_values: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(tag.to_string())];
    if prefix {
        bind_values.push(Box::new(format!("{tag}/%")));
    }

    let sql = match source {
        Some(src) => {
            let next = bind_values.len() + 1;
            bind_values.push(Box::new(src.to_string()));
            format!(
                "SELECT DISTINCT path FROM note_inline_tags WHERE {tag_condition} AND source = ?{next} ORDER BY path ASC"
            )
        }
        None => {
            format!(
                "SELECT DISTINCT path FROM note_inline_tags WHERE {tag_condition} ORDER BY path ASC"
            )
        }
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(&bind_values), |row| row.get(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn tags_get_notes_for_tag(
    app: AppHandle,
    vault_id: String,
    tag: String,
    source: Option<String>,
) -> Result<Vec<String>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        query_notes_by_tag(conn, &tag, source.as_deref(), false)
    })
}

#[tauri::command]
#[specta::specta]
pub fn tags_get_notes_for_tag_prefix(
    app: AppHandle,
    vault_id: String,
    tag: String,
    source: Option<String>,
) -> Result<Vec<String>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        query_notes_by_tag(conn, &tag, source.as_deref(), true)
    })
}

#[tauri::command]
#[specta::specta]
pub fn notes_with_code_language(
    app: AppHandle,
    vault_id: String,
    language: String,
) -> Result<Vec<String>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT path FROM note_code_blocks WHERE language = ?1 ORDER BY path ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![language], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
#[specta::specta]
pub fn property_registry_list(
    app: AppHandle,
    vault_id: String,
) -> Result<Vec<PropertyRegistryEntry>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT key, inferred_type, note_count FROM property_registry ORDER BY key ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(PropertyRegistryEntry {
                    key: row.get(0)?,
                    inferred_type: row.get(1)?,
                    note_count: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    })
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct PropertyFilter {
    pub key: String,
    pub op: String,
    pub value: String,
}

#[tauri::command]
#[specta::specta]
pub fn notes_with_tag_in_section(
    app: AppHandle,
    vault_id: String,
    tag: String,
    heading_id: String,
) -> Result<Vec<String>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT t.path
                 FROM note_inline_tags t
                 JOIN note_sections s ON s.path = t.path
                 WHERE t.tag = ?1
                   AND s.heading_id = ?2
                   AND t.line BETWEEN s.start_line AND s.end_line
                 ORDER BY t.path ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![tag, heading_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
#[specta::specta]
pub fn notes_by_property_filter(
    app: AppHandle,
    vault_id: String,
    filters: Vec<PropertyFilter>,
) -> Result<Vec<String>, String> {
    if filters.is_empty() {
        return Err("at least one filter required".to_string());
    }

    with_read_conn(&app, &vault_id, |conn| {
        let mut conditions = Vec::new();
        let mut bind_values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        let mut param_idx = 1;

        for f in &filters {
            let cond = match f.op.as_str() {
                "=" | "eq" => {
                    let c = format!(
                        "path IN (SELECT path FROM note_properties WHERE key = ?{} AND value = ?{})",
                        param_idx,
                        param_idx + 1
                    );
                    bind_values.push(Box::new(f.key.clone()));
                    bind_values.push(Box::new(f.value.clone()));
                    param_idx += 2;
                    c
                }
                "!=" | "neq" => {
                    let c = format!(
                        "path NOT IN (SELECT path FROM note_properties WHERE key = ?{} AND value = ?{})",
                        param_idx,
                        param_idx + 1
                    );
                    bind_values.push(Box::new(f.key.clone()));
                    bind_values.push(Box::new(f.value.clone()));
                    param_idx += 2;
                    c
                }
                "like" => {
                    let c = format!(
                        "path IN (SELECT path FROM note_properties WHERE key = ?{} AND value LIKE ?{})",
                        param_idx,
                        param_idx + 1
                    );
                    bind_values.push(Box::new(f.key.clone()));
                    bind_values.push(Box::new(f.value.clone()));
                    param_idx += 2;
                    c
                }
                "exists" => {
                    let c = format!(
                        "path IN (SELECT path FROM note_properties WHERE key = ?{})",
                        param_idx
                    );
                    bind_values.push(Box::new(f.key.clone()));
                    param_idx += 1;
                    c
                }
                "not_exists" => {
                    let c = format!(
                        "path NOT IN (SELECT path FROM note_properties WHERE key = ?{})",
                        param_idx
                    );
                    bind_values.push(Box::new(f.key.clone()));
                    param_idx += 1;
                    c
                }
                other => return Err(format!("unsupported filter op: {other}")),
            };
            conditions.push(cond);
        }

        let sql = format!(
            "SELECT DISTINCT path FROM notes WHERE {} ORDER BY path ASC",
            conditions.join(" AND ")
        );

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(&bind_values), |row| row.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
#[specta::specta]
pub fn section_get_range(
    app: AppHandle,
    vault_id: String,
    path: String,
    heading_id: String,
) -> Result<Option<SectionInfo>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT heading_id, level, title, start_line, end_line, word_count
                 FROM note_sections WHERE path = ?1 AND heading_id = ?2",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query_map(params![path, heading_id], |row| {
                Ok(SectionInfo {
                    heading_id: row.get(0)?,
                    level: row.get(1)?,
                    title: row.get(2)?,
                    start_line: row.get(3)?,
                    end_line: row.get(4)?,
                    word_count: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(info)) => Ok(Some(info)),
            Some(Err(e)) => Err(e.to_string()),
            None => Ok(None),
        }
    })
}
