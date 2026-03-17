use crate::shared::io_utils;
use crate::shared::storage;
use ropey::Rope;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct ManagedBuffer {
    pub rope: Rope,
    pub path: String,
}

pub struct BufferManager {
    pub buffers: Mutex<HashMap<String, Arc<ManagedBuffer>>>,
}

impl BufferManager {
    pub fn new() -> Self {
        Self {
            buffers: Mutex::new(HashMap::new()),
        }
    }

    pub fn open_buffer(
        &self,
        app: &tauri::AppHandle,
        id: String,
        vault_id: String,
        relative_path: String,
    ) -> Result<usize, String> {
        let root = storage::vault_path(app, &vault_id)?;
        let abs = crate::features::notes::service::safe_vault_abs(&root, &relative_path)?;

        let content = io_utils::read_file_to_string(&abs)?;
        let rope = Rope::from_str(&content);
        let line_count = rope.len_lines();

        let mut buffers = self.buffers.lock().unwrap();
        buffers.insert(
            id,
            Arc::new(ManagedBuffer {
                rope,
                path: abs.to_string_lossy().to_string(),
            }),
        );
        Ok(line_count)
    }

    pub fn update_buffer(&self, id: String, content: &str) -> Result<(), String> {
        let mut buffers = self.buffers.lock().unwrap();
        if let Some(buffer) = buffers.get_mut(&id) {
            let path = buffer.path.clone();
            *buffer = Arc::new(ManagedBuffer {
                rope: Rope::from_str(content),
                path,
            });
            Ok(())
        } else {
            Err("Buffer not found".to_string())
        }
    }

    pub fn save_buffer(&self, id: String) -> Result<(), String> {
        let buffer = self.get_buffer(&id).ok_or("Buffer not found")?;
        let content = buffer.rope.to_string();
        io_utils::atomic_write(&buffer.path, content)?;
        Ok(())
    }

    pub fn get_buffer(&self, id: &str) -> Option<Arc<ManagedBuffer>> {
        let buffers = self.buffers.lock().unwrap();
        buffers.get(id).cloned()
    }

    pub fn close_buffer(&self, id: &str) {
        let mut buffers = self.buffers.lock().unwrap();
        buffers.remove(id);
    }
}

#[tauri::command]
#[specta::specta]
pub fn open_buffer(
    app: tauri::AppHandle,
    id: String,
    vault_id: String,
    relative_path: String,
    manager: State<'_, BufferManager>,
) -> Result<usize, String> {
    manager.open_buffer(&app, id, vault_id, relative_path)
}

#[tauri::command]
#[specta::specta]
pub fn update_buffer(
    id: String,
    content: String,
    manager: State<'_, BufferManager>,
) -> Result<(), String> {
    manager.update_buffer(id, &content)
}

#[tauri::command]
#[specta::specta]
pub fn save_buffer(id: String, manager: State<'_, BufferManager>) -> Result<(), String> {
    manager.save_buffer(id)
}

#[tauri::command]
#[specta::specta]
pub fn read_buffer_window(
    id: String,
    start_line: usize,
    end_line: usize,
    manager: State<'_, BufferManager>,
) -> Result<String, String> {
    let buffer = manager.get_buffer(&id).ok_or("Buffer not found")?;
    let rope = &buffer.rope;

    let line_count = rope.len_lines();
    if start_line >= line_count {
        return Ok(String::new());
    }

    let end_line = end_line.min(line_count);
    if start_line >= end_line {
        return Ok(String::new());
    }

    let start_char = rope.line_to_char(start_line);
    let end_char = if end_line == line_count {
        rope.len_chars()
    } else {
        rope.line_to_char(end_line)
    };

    Ok(rope.slice(start_char..end_char).to_string())
}

#[tauri::command]
#[specta::specta]
pub fn close_buffer(id: String, manager: State<'_, BufferManager>) -> Result<(), String> {
    manager.close_buffer(&id);
    Ok(())
}
