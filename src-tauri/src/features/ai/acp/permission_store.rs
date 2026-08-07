use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const STORE_FILE: &str = "acp-permissions.json";
const STORE_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Grant {
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

pub fn default_store_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".carbide")
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

    pub fn add_grant(
        &mut self,
        agent_id: String,
        tool_name: String,
        kind: String,
        path_prefix: Option<String>,
    ) -> Result<(), String> {
        self.grants.retain(|grant| {
            !(grant.agent_id == agent_id
                && grant.tool_name == tool_name
                && grant.kind == kind
                && grant.path_prefix == path_prefix)
        });
        self.grants.push(Grant {
            agent_id,
            tool_name,
            kind,
            path_prefix,
            granted_at: unix_secs(),
        });
        self.persist()
    }

    pub fn revoke(&mut self, agent_id: &str, tool_name: &str, kind: &str) -> Result<(), String> {
        let before = self.grants.len();
        self.grants.retain(|grant| {
            !(grant.agent_id == agent_id && grant.tool_name == tool_name && grant.kind == kind)
        });
        if self.grants.len() == before {
            return Ok(());
        }
        self.persist()
    }

    fn persist(&self) -> Result<(), String> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir)
                .map_err(|e| format!("Failed to create permission store dir: {e}"))?;
        }

        let body = serde_json::to_string_pretty(&serde_json::json!({
            "version": STORE_VERSION,
            "grants": self.grants,
        }))
        .map_err(|e| format!("Failed to serialize permission grants: {e}"))?;

        // Temp file plus rename: a crash mid-write leaves the previous grants
        // intact rather than a truncated file the next load would discard.
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, body)
            .map_err(|e| format!("Failed to write permission grants: {e}"))?;
        std::fs::rename(&tmp, &self.path)
            .map_err(|e| format!("Failed to commit permission grants: {e}"))
    }
}

fn covers(path_prefix: Option<&str>, paths: &[String]) -> bool {
    match path_prefix {
        None => true,
        Some(prefix) => paths.iter().any(|path| within(path, prefix)),
    }
}

fn within(path: &str, prefix: &str) -> bool {
    let Some(rest) = path.strip_prefix(prefix) else {
        return false;
    };
    rest.is_empty() || rest.starts_with('/') || rest.starts_with('\\')
}

fn unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
