use crate::features::search::service::with_read_conn;
use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
pub struct TagInfo {
    pub tag: String,
    pub count: i64,
}

#[tauri::command]
pub fn tags_list_all(app: AppHandle, vault_id: String) -> Result<Vec<TagInfo>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT tag, COUNT(*) as cnt FROM note_tags GROUP BY tag ORDER BY cnt DESC, tag ASC",
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
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn tags_get_notes_for_tag(
    app: AppHandle,
    vault_id: String,
    tag: String,
) -> Result<Vec<String>, String> {
    with_read_conn(&app, &vault_id, |conn| {
        let mut stmt = conn
            .prepare("SELECT path FROM note_tags WHERE tag = ?1 ORDER BY path ASC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![tag], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}
