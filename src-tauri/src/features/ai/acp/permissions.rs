use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use tauri::State;
use tokio::sync::oneshot;

use crate::features::ai::agent_stream::{
    AgentEvent, PermissionOptionKind, PermissionOptionSpec, ToolKind, ToolSelector,
};

use super::permission_store::{default_store_dir, random_hex_id, Grant, GrantStore};

/// How long a parked request may wait for the user before the engine gives up
/// on it and answers Timeout.
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
    /// Already gated elsewhere — prompting would ask twice for one call. The
    /// caller decides this; the engine only honours it.
    pub pre_authorized: bool,
    pub options: Vec<PermissionOptionSpec>,
}

impl PermissionRequestSpec {
    pub fn to_event(&self, request_id: String) -> AgentEvent {
        AgentEvent::PermissionRequest {
            request_id,
            tool_call_id: self.tool_call_id.clone(),
            name: self.name.clone(),
            kind: self.kind,
            input_summary: self.input_summary.clone(),
            paths: self.paths.clone(),
            mutating: self.mutating,
            options: self.options.clone(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Evaluation {
    Allow,
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

/// How a parked request ended, from the waiting caller's point of view.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParkOutcome {
    Selected {
        option_id: String,
        kind: PermissionOptionKind,
    },
    Cancelled,
    Timeout,
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
        if spec.pre_authorized {
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

    /// Parks the request and owns the whole wait: the timer, the empty-option
    /// normalisation, and — through the guard — removing the pending entry on
    /// every exit, including the future being dropped by a session teardown.
    pub async fn await_decision(
        self: &Arc<Self>,
        request_id: String,
        spec: PermissionRequestSpec,
    ) -> ParkOutcome {
        let receiver = self.park(request_id.clone(), spec);
        let _guard = PendingGuard {
            engine: self.clone(),
            request_id,
        };

        match tokio::time::timeout(PERMISSION_TIMEOUT, receiver).await {
            // An empty option_id is the synthetic Deny for a prompt the agent
            // offered no reject option for; there is nothing to answer with.
            Ok(Ok(ParkedDecision::Selected { option_id, kind })) if !option_id.is_empty() => {
                ParkOutcome::Selected { option_id, kind }
            }
            Ok(Ok(_)) | Ok(Err(_)) => ParkOutcome::Cancelled,
            Err(_) => ParkOutcome::Timeout,
        }
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
    /// or one whose caller already gave up and dropped its receiver.
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

    pub fn record_choice(&self, spec: &PermissionRequestSpec, kind: PermissionOptionKind) {
        if kind != PermissionOptionKind::AllowAlways {
            return;
        }

        let write = {
            let mut store = self.store();
            store.insert_grant(
                spec.agent_id.clone(),
                spec.name.clone(),
                kind_name(spec.kind).to_string(),
                longest_common_dir(&spec.paths),
            );
            store.pending_write()
        };

        match write {
            Ok(write) => write.schedule(),
            Err(e) => log::warn!("Failed to persist permission grant for {}: {e}", spec.name),
        }
    }

    pub fn grants(&self) -> Vec<Grant> {
        self.store().grants()
    }

    pub fn revoke(&self, id: &str) -> Result<(), String> {
        self.store().revoke(id)
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

struct PendingGuard {
    engine: Arc<PermissionEngine>,
    request_id: String,
}

impl Drop for PendingGuard {
    fn drop(&mut self) {
        self.engine.pending().remove(&self.request_id);
    }
}

/// `Only { .. }` is a narrowed grant, so it decides like safe mode. Every kind
/// is spelled out: a new one must fail to compile rather than default to a
/// permission.
fn preset_decision(toolset: &ToolSelector, spec: &PermissionRequestSpec) -> Evaluation {
    let power = matches!(toolset, ToolSelector::Full);
    match spec.kind {
        ToolKind::Read | ToolKind::Search | ToolKind::Think | ToolKind::Fetch => Evaluation::Allow,
        ToolKind::Edit | ToolKind::Move if power => Evaluation::Allow,
        ToolKind::SwitchMode if !spec.mutating => Evaluation::Allow,
        ToolKind::Edit | ToolKind::Move | ToolKind::SwitchMode => Evaluation::Prompt,
        ToolKind::Delete | ToolKind::Execute | ToolKind::Other => Evaluation::Prompt,
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

pub fn option_kind_name(kind: PermissionOptionKind) -> &'static str {
    match kind {
        PermissionOptionKind::AllowOnce => "allow_once",
        PermissionOptionKind::AllowAlways => "allow_always",
        PermissionOptionKind::RejectOnce => "reject_once",
        PermissionOptionKind::RejectAlways => "reject_always",
    }
}

// Request identity is minted here, not borrowed from the tool call: an agent
// that re-asks for the same call must produce a distinct request, or the answer
// cannot be routed back to the right parked responder.
pub fn mint_request_id() -> String {
    format!("perm-{}", random_hex_id())
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
    engine: State<'_, Arc<PermissionEngine>>,
    request_id: String,
    option_id: String,
    option_kind: PermissionOptionKind,
) -> Result<bool, String> {
    Ok(engine.resolve(&request_id, &option_id, option_kind))
}

#[tauri::command]
#[specta::specta]
pub async fn agent_permission_grants(
    engine: State<'_, Arc<PermissionEngine>>,
) -> Result<Vec<Grant>, String> {
    Ok(engine.grants())
}

#[tauri::command]
#[specta::specta]
pub async fn agent_permission_revoke(
    engine: State<'_, Arc<PermissionEngine>>,
    id: String,
) -> Result<(), String> {
    engine.revoke(&id)
}
