pub mod canvas_link_extractor;

use crate::shared::storage;
use tauri::AppHandle;

#[tauri::command]
pub fn extract_canvas_links(
    app: AppHandle,
    vault_id: String,
    relative_path: String,
) -> Result<Vec<String>, String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = root.join(&relative_path);
    let content = std::fs::read_to_string(&abs).map_err(|e| e.to_string())?;
    canvas_link_extractor::extract_all_link_targets(&content)
}

#[tauri::command]
pub fn extract_canvas_text(
    app: AppHandle,
    vault_id: String,
    relative_path: String,
) -> Result<String, String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = root.join(&relative_path);
    let content = std::fs::read_to_string(&abs).map_err(|e| e.to_string())?;
    let extracted = canvas_link_extractor::extract_canvas_content(&content)?;
    Ok(extracted.text_body)
}

#[tauri::command]
pub fn rewrite_canvas_file_refs(
    app: AppHandle,
    vault_id: String,
    canvas_path: String,
    old_path: String,
    new_path: String,
) -> Result<bool, String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = root.join(&canvas_path);
    let content = std::fs::read_to_string(&abs).map_err(|e| e.to_string())?;

    let mut json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse canvas: {e}"))?;

    let old_name = old_path
        .rsplit('/')
        .next()
        .unwrap_or(&old_path)
        .trim_end_matches(".md");
    let new_name = new_path
        .rsplit('/')
        .next()
        .unwrap_or(&new_path)
        .trim_end_matches(".md");

    let mut changed = false;

    if let Some(nodes) = json.get_mut("nodes").and_then(|n| n.as_array_mut()) {
        for node in nodes {
            if let Some(file_val) = node.get_mut("file") {
                if file_val.as_str() == Some(&old_path) {
                    *file_val = serde_json::Value::String(new_path.clone());
                    changed = true;
                }
            }
            if let Some(text_val) = node.get_mut("text") {
                if let Some(text) = text_val.as_str() {

                    let old_link = format!("[[{old_name}]]");
                    let new_link = format!("[[{new_name}]]");
                    if text.contains(&old_link) {
                        let rewritten = text.replace(&old_link, &new_link);
                        *text_val = serde_json::Value::String(rewritten);
                        changed = true;
                    }
                }
            }
        }
    }

    if changed {
        let output = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
        crate::shared::io_utils::atomic_write(&abs, output.as_bytes())?;
    }

    Ok(changed)
}

#[tauri::command]
pub fn rewrite_canvas_refs_for_rename(
    app: AppHandle,
    vault_id: String,
    old_path: String,
    new_path: String,
) -> Result<u32, String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let mut count = 0u32;

    let old_name = old_path
        .rsplit('/')
        .next()
        .unwrap_or(&old_path)
        .trim_end_matches(".md");
    let new_name = new_path
        .rsplit('/')
        .next()
        .unwrap_or(&new_path)
        .trim_end_matches(".md");
    let old_link = format!("[[{old_name}]]");
    let new_link = format!("[[{new_name}]]");

    for entry in walkdir::WalkDir::new(&root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            let ext = e.path().extension().and_then(|x| x.to_str());
            ext == Some("canvas") || ext == Some("excalidraw")
        })
    {
        let abs = entry.path();
        let content = match std::fs::read_to_string(abs) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let mut json: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let mut changed = false;

        if let Some(nodes) = json.get_mut("nodes").and_then(|n| n.as_array_mut()) {
            for node in nodes {
                if let Some(file_val) = node.get_mut("file") {
                    if file_val.as_str() == Some(&old_path) {
                        *file_val = serde_json::Value::String(new_path.clone());
                        changed = true;
                    }
                }
                if let Some(text_val) = node.get_mut("text") {
                    if let Some(text) = text_val.as_str() {
                        if text.contains(&old_link) {
                            let rewritten = text.replace(&old_link, &new_link);
                            *text_val = serde_json::Value::String(rewritten);
                            changed = true;
                        }
                    }
                }
            }
        }

        if let Some(elements) = json.get_mut("elements").and_then(|e| e.as_array_mut()) {
            for element in elements {
                if let Some(text_val) = element.get_mut("text") {
                    if let Some(text) = text_val.as_str() {
                        if text.contains(&old_link) {
                            let rewritten = text.replace(&old_link, &new_link);
                            *text_val = serde_json::Value::String(rewritten);
                            changed = true;
                        }
                    }
                }
            }
        }

        if changed {
            if let Ok(output) = serde_json::to_string_pretty(&json) {
                let _ = crate::shared::io_utils::atomic_write(abs, output.as_bytes());
                count += 1;
            }
        }
    }

    Ok(count)
}
