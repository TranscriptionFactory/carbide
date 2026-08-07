use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::features::mcp::auth::dirs_config_path;
use crate::shared::io_utils::atomic_write;

const STORE_FILE: &str = "acp-permissions.json";
const STORE_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Grant {
    /// Minted here, not derived from the scope: revocation addresses one row,
    /// not a re-derived match.
    pub id: String,
    pub agent_id: String,
    pub tool_name: String,
    pub kind: String,
    pub path_prefix: Option<String>,
    pub granted_at: u64,
}

#[derive(Serialize, Deserialize)]
struct StoreFile {
    version: u32,
    grants: Vec<Grant>,
}

pub fn random_hex_id() -> String {
    let mut bytes = [0u8; 8];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut bytes);
    hex::encode(bytes)
}

pub fn default_store_dir() -> PathBuf {
    dirs_config_path()
}

/// Persistent "allow always" grants. Reading never writes: an unreadable or
/// future-versioned file is treated as empty in memory but left on disk, so a
/// newer Carbide's grants survive being opened by an older one.
pub struct GrantStore {
    path: PathBuf,
    grants: Vec<Grant>,
}

impl GrantStore {
    pub fn load(dir: &Path) -> Self {
        let path = dir.join(STORE_FILE);
        let grants = match std::fs::read_to_string(&path) {
            Ok(raw) => match serde_json::from_str::<StoreFile>(&raw) {
                Ok(file) if file.version == STORE_VERSION => file.grants,
                Ok(file) => {
                    log::warn!(
                        "ACP permission store at {} has unsupported version {}; ignoring its grants",
                        path.display(),
                        file.version
                    );
                    Vec::new()
                }
                Err(e) => {
                    log::warn!(
                        "ACP permission store at {} is unreadable ({e}); starting with no grants",
                        path.display()
                    );
                    Vec::new()
                }
            },
            Err(_) => Vec::new(),
        };
        Self { path, grants }
    }

    pub fn grants(&self) -> Vec<Grant> {
        self.grants.clone()
    }

    /// An exact tool grant stands on its own; a kind grant additionally has to
    /// cover one of the paths the call touches.
    pub fn has_grant(&self, agent_id: &str, tool_name: &str, kind: &str, paths: &[String]) -> bool {
        self.grants.iter().any(|grant| {
            grant.agent_id == agent_id
                && (grant.tool_name == tool_name
                    || (grant.kind == kind && covers(grant.path_prefix.as_deref(), paths)))
        })
    }

    /// Memory only, so a caller holding a lock can drop it before the write.
    pub fn insert_grant(
        &mut self,
        agent_id: String,
        tool_name: String,
        kind: String,
        path_prefix: Option<String>,
    ) {
        self.grants.retain(|grant| {
            !(grant.agent_id == agent_id
                && grant.tool_name == tool_name
                && grant.kind == kind
                && grant.path_prefix == path_prefix)
        });
        self.grants.push(Grant {
            id: random_hex_id(),
            agent_id,
            tool_name,
            kind,
            path_prefix,
            granted_at: unix_secs(),
        });
    }

    pub fn add_grant(
        &mut self,
        agent_id: String,
        tool_name: String,
        kind: String,
        path_prefix: Option<String>,
    ) -> Result<(), String> {
        self.insert_grant(agent_id, tool_name, kind, path_prefix);
        self.pending_write()?.commit()
    }

    pub fn revoke(&mut self, id: &str) -> Result<(), String> {
        let before = self.grants.len();
        self.grants.retain(|grant| grant.id != id);
        if self.grants.len() == before {
            return Ok(());
        }
        self.pending_write()?.commit()
    }

    /// A serialized snapshot plus its destination: the payload is built while
    /// the caller still holds the store, the file write happens after.
    pub fn pending_write(&self) -> Result<StoreWrite, String> {
        let body = serde_json::to_string_pretty(&StoreFile {
            version: STORE_VERSION,
            grants: self.grants.clone(),
        })
        .map_err(|e| format!("Failed to serialize permission grants: {e}"))?;
        Ok(StoreWrite {
            path: self.path.clone(),
            body,
        })
    }
}

pub struct StoreWrite {
    path: PathBuf,
    body: String,
}

impl StoreWrite {
    pub fn commit(self) -> Result<(), String> {
        atomic_write(&self.path, &self.body)
    }

    /// Fire-and-forget: the grant is already live in memory, so a decision
    /// never waits on disk. Off an executor the write runs inline, which is
    /// also what keeps the store tests deterministic.
    pub fn schedule(self) {
        let write = move || {
            if let Err(e) = self.commit() {
                log::warn!("Failed to persist permission grants: {e}");
            }
        };
        match tokio::runtime::Handle::try_current() {
            Ok(_) => {
                tauri::async_runtime::spawn_blocking(write);
            }
            Err(_) => write(),
        }
    }
}

fn covers(path_prefix: Option<&str>, paths: &[String]) -> bool {
    match path_prefix {
        None => true,
        // Component-wise, so a sibling that merely shares the prefix as a
        // string ("/vault/notes-backup") is outside it.
        Some(prefix) => paths.iter().any(|path| Path::new(path).starts_with(prefix)),
    }
}

fn unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
