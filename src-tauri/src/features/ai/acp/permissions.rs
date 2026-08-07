use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use tauri::State;
use tokio::sync::oneshot;

use crate::features::ai::agent_stream::{
    PermissionOptionKind, PermissionOptionSpec, ToolKind, ToolSelector,
};
use crate::features::ai::harness::MCP_TOOL_PREFIX;

use super::permission_store::{default_store_dir, Grant, GrantStore};

/// How long a parked request may wait for the user before its caller gives up.
/// The engine never enforces this itself — the parking caller owns the timer.
pub const PERMISSION_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, PartialEq)]
pub struct PermissionRequestSpec {
    pub agent_id: String,
    pub tool_call_id: Option<String>,
    pub name: String,
    pub kind: ToolKind,
    pub input_summary: String,
    pub paths: Vec<String>,
    pub mutating: bool,
    pub options: Vec<PermissionOptionSpec>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Evaluation {
    Allow,
    Deny,
    Prompt,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParkedDecision {
    Selected {
        option_id: String,
        kind: PermissionOptionKind,
    },
    Cancelled,
}

struct Pending {
    spec: PermissionRequestSpec,
    responder: oneshot::Sender<ParkedDecision>,
}

pub struct PermissionEngine {
    store: Mutex<GrantStore>,
    pending: Mutex<HashMap<String, Pending>>,
}

impl Default for PermissionEngine {
    fn default() -> Self {
        Self::new(&default_store_dir())
    }
}

impl PermissionEngine {
    pub fn new(store_dir: &Path) -> Self {
        Self {
            store: Mutex::new(GrantStore::load(store_dir)),
            pending: Mutex::new(HashMap::new()),
        }
    }

    pub fn evaluate(&self, toolset: &ToolSelector, spec: &PermissionRequestSpec) -> Evaluation {
        // Carbide's own MCP tools are already gated by the scoped token the
        // dispatch layer checks; prompting here would ask twice for one call.
        if spec.name.starts_with(MCP_TOOL_PREFIX) {
            return Evaluation::Allow;
        }

        if self.store().has_grant(
            &spec.agent_id,
            &spec.name,
            kind_name(spec.kind),
            &spec.paths,
        ) {
            return Evaluation::Allow;
        }

        preset_decision(toolset, spec)
    }

    pub fn park(
        &self,
        request_id: String,
        spec: PermissionRequestSpec,
    ) -> oneshot::Receiver<ParkedDecision> {
        let (responder, receiver) = oneshot::channel();
        self.pending()
            .insert(request_id, Pending { spec, responder });
        receiver
    }

    /// Returns false when nothing was waiting on `request_id` — an unknown id,
    /// or one whose caller already timed out and dropped its receiver.
    pub fn resolve(
        &self,
        request_id: &str,
        option_id: &str,
        option_kind: PermissionOptionKind,
    ) -> bool {
        let Some(pending) = self.pending().remove(request_id) else {
            return false;
        };

        let delivered = pending
            .responder
            .send(ParkedDecision::Selected {
                option_id: option_id.to_string(),
                kind: option_kind,
            })
            .is_ok();

        if delivered {
            self.record_choice(&pending.spec, option_kind);
        }
        delivered
    }

    /// Unblocks one parked prompt as Cancelled — the session that owns the
    /// request calls this when its turn is aborted, without disturbing other
    /// sessions' pending prompts.
    pub fn cancel(&self, request_id: &str) -> bool {
        let Some(pending) = self.pending().remove(request_id) else {
            return false;
        };
        pending.responder.send(ParkedDecision::Cancelled).is_ok()
    }

    pub fn drain_all(&self) {
        for (_, pending) in self.pending().drain() {
            let _ = pending.responder.send(ParkedDecision::Cancelled);
        }
    }

    pub fn record_choice(&self, spec: &PermissionRequestSpec, kind: PermissionOptionKind) {
        if kind != PermissionOptionKind::AllowAlways {
            return;
        }
        let path_prefix = longest_common_dir(&spec.paths);
        if let Err(e) = self.store().add_grant(
            spec.agent_id.clone(),
            spec.name.clone(),
            kind_name(spec.kind).to_string(),
            path_prefix,
        ) {
            log::warn!("Failed to persist permission grant for {}: {e}", spec.name);
        }
    }

    pub fn grants(&self) -> Vec<Grant> {
        self.store().grants()
    }

    pub fn revoke(&self, agent_id: &str, tool_name: &str, kind: &str) -> Result<(), String> {
        self.store().revoke(agent_id, tool_name, kind)
    }

    /// Both guards recover from poisoning: a panic while holding them would
    /// otherwise wedge every later permission decision.
    fn store(&self) -> MutexGuard<'_, GrantStore> {
        self.store.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn pending(&self) -> MutexGuard<'_, HashMap<String, Pending>> {
        self.pending.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// `Only { .. }` is a narrowed grant, so it decides like safe mode.
fn preset_decision(toolset: &ToolSelector, spec: &PermissionRequestSpec) -> Evaluation {
    let power = matches!(toolset, ToolSelector::Full);
    match spec.kind {
        ToolKind::Read | ToolKind::Search | ToolKind::Think | ToolKind::Fetch => Evaluation::Allow,
        ToolKind::Edit | ToolKind::Move => {
            if power {
                Evaluation::Allow
            } else {
                Evaluation::Prompt
            }
        }
        ToolKind::Delete | ToolKind::Execute => Evaluation::Prompt,
        ToolKind::Other => Evaluation::Prompt,
        ToolKind::SwitchMode => {
            if spec.mutating {
                Evaluation::Prompt
            } else {
                Evaluation::Allow
            }
        }
    }
}

pub fn kind_name(kind: ToolKind) -> &'static str {
    match kind {
        ToolKind::Read => "read",
        ToolKind::Edit => "edit",
        ToolKind::Delete => "delete",
        ToolKind::Move => "move",
        ToolKind::Search => "search",
        ToolKind::Execute => "execute",
        ToolKind::Think => "think",
        ToolKind::Fetch => "fetch",
        ToolKind::SwitchMode => "switch_mode",
        ToolKind::Other => "other",
    }
}

// Request identity is minted here, not borrowed from the tool call: an agent
// that re-asks for the same call must produce a distinct request, or the answer
// cannot be routed back to the right parked responder.
pub fn mint_request_id() -> String {
    let mut bytes = [0u8; 8];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut bytes);
    format!("perm-{}", hex::encode(bytes))
}

/// The directory a persisted grant is scoped to: deepest ancestor shared by
/// every path in the call, so allowing one edit does not grant the whole vault.
fn longest_common_dir(paths: &[String]) -> Option<String> {
    let mut common: Option<PathBuf> = None;
    for path in paths {
        let dir = Path::new(path).parent()?;
        common = Some(match common {
            None => dir.to_path_buf(),
            Some(acc) => common_prefix(&acc, dir),
        });
    }

    let common = common?.to_string_lossy().to_string();
    (!common.is_empty()).then_some(common)
}

fn common_prefix(a: &Path, b: &Path) -> PathBuf {
    a.components()
        .zip(b.components())
        .take_while(|(x, y)| x == y)
        .map(|(x, _)| x.as_os_str())
        .collect()
}

#[tauri::command]
#[specta::specta]
pub async fn agent_permission_decide(
    engine: State<'_, std::sync::Arc<PermissionEngine>>,
    request_id: String,
    option_id: String,
    option_kind: PermissionOptionKind,
) -> Result<bool, String> {
    Ok(engine.resolve(&request_id, &option_id, option_kind))
}

#[tauri::command]
#[specta::specta]
pub async fn agent_permission_grants(
    engine: State<'_, std::sync::Arc<PermissionEngine>>,
) -> Result<Vec<Grant>, String> {
    Ok(engine.grants())
}

#[tauri::command]
#[specta::specta]
pub async fn agent_permission_revoke(
    engine: State<'_, std::sync::Arc<PermissionEngine>>,
    agent_id: String,
    tool_name: String,
    kind: String,
) -> Result<(), String> {
    engine.revoke(&agent_id, &tool_name, &kind)
}
