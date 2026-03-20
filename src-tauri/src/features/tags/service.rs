use crate::features::search::service::with_read_conn;
use rusqlite::params;
use serde::Serialize;
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

#[tauri::command]
#[specta::specta]
pub fn tags_get_notes_for_tag(
    app: AppHandle,
    vault_id: String,
    tag: String,
    source: Option<String>,
) -> Result<Vec<String>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        let (sql, tag_params): (&str, Vec<Box<dyn rusqlite::ToSql>>) = match source.as_deref() {
            Some(src) => (
                "SELECT DISTINCT path FROM note_inline_tags WHERE tag = ?1 AND source = ?2 ORDER BY path ASC",
                vec![Box::new(tag.clone()), Box::new(src.to_string())],
            ),
            None => (
                "SELECT DISTINCT path FROM note_inline_tags WHERE tag = ?1 ORDER BY path ASC",
                vec![Box::new(tag.clone())],
            ),
        };
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(&tag_params), |row| row.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
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
