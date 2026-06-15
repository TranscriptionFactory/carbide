use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagCitationDto {
    pub index: u32,
    pub note_path: String,
    pub title: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct RagQueryResponse {
    #[serde(default)]
    pub answer: String,
    #[serde(default)]
    pub citations: Vec<RagCitationDto>,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RagQueryRequestEvent {
    pub id: u64,
    pub question: String,
    pub folder: Option<String>,
    pub tag: Option<String>,
}

#[derive(Default)]
pub struct RagBridgeState {
    next_id: AtomicU64,
    pending: Mutex<HashMap<u64, Sender<RagQueryResponse>>>,
}

impl RagBridgeState {
    pub fn register(&self) -> (u64, Receiver<RagQueryResponse>) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = channel();
        if let Ok(mut pending) = self.pending.lock() {
            pending.insert(id, tx);
        }
        (id, rx)
    }

    pub fn resolve(&self, id: u64, response: RagQueryResponse) {
        if let Ok(mut pending) = self.pending.lock() {
            if let Some(tx) = pending.remove(&id) {
                let _ = tx.send(response);
            }
        }
    }

    pub fn cancel(&self, id: u64) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(&id);
        }
    }
}

#[tauri::command]
pub fn rag_query_respond(
    app: AppHandle,
    id: u64,
    response: RagQueryResponse,
) -> Result<(), String> {
    app.state::<RagBridgeState>().resolve(id, response);
    Ok(())
}
