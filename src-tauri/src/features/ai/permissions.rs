use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use tauri::State;
use tokio::sync::oneshot;

use crate::features::ai::agent_stream::{
    AgentEvent, PermissionOptionKind, PermissionOptionSpec, ToolKind,
};

use super::permission_store::{default_store_dir, random_hex_id, Grant, GrantStore};

/// How long a parked request may wait for the user before the engine gives up
/// on it and answers Timeout.
pub const PERMISSION_TIMEOUT: Duration = Duration::from_secs(600);

/// An unconsumed ticket is one the harness asked for and never called; the cap
/// bounds that leak without needing to expire them on a timer.
const MAX_TICKETS: usize = 16;

/// The live permission axis for one assistant session. Shared rather than
/// cloned into a run, so flipping `auto_approve` mid-run is observed by the
/// next tool call on every path that gates one.
#[derive(Default)]
pub struct SessionPolicy {
    auto_approve: AtomicBool,
    /// Single-use approvals for Carbide's own MCP tools. A harness asks over
    /// ACP and then calls over HTTP — two gates on one intention — and the
    /// ticket is what carries the first gate's answer to the second, so the
    /// user is never asked twice and never approves a call that is then
    /// refused. Keyed by bare tool name: the window between the two is one
    /// round trip, and a name is the most the HTTP layer can match on.
    tickets: Mutex<VecDeque<String>>,
    /// Request ids this session has parked, so turning auto-approve on answers
    /// exactly its own prompts and no other session's.
    parked: Mutex<Vec<String>>,
}

impl SessionPolicy {
    /// Terminal handoff and the CLI run under the user's own hands, with no
    /// session to flip; they carry a policy that is on and stays on.
    pub fn always_on() -> Self {
        Self {
            auto_approve: AtomicBool::new(true),
            ..Self::default()
        }
    }

    pub fn auto_approve(&self) -> bool {
        self.auto_approve.load(Ordering::Relaxed)
    }

    pub fn set_auto_approve(&self, enabled: bool) {
        self.auto_approve.store(enabled, Ordering::Relaxed);
    }

    pub fn grant_ticket(&self, name: &str) {
        let mut tickets = self.lock_tickets();
        if tickets.len() == MAX_TICKETS {
            tickets.pop_front();
        }
        tickets.push_back(name.to_string());
    }

    pub fn consume_ticket(&self, name: &str) -> bool {
        let mut tickets = self.lock_tickets();
        match tickets.iter().position(|t| t == name) {
            Some(index) => {
                tickets.remove(index);
                true
            }
            None => false,
        }
    }

    pub fn park(&self, request_id: String) {
        self.lock_parked().push(request_id);
    }

    pub fn unpark(&self, request_id: &str) {
        self.lock_parked().retain(|id| id != request_id);
    }

    /// Empties the list: every caller here is answering the prompts, so
    /// leaving them listed would let a second flip answer them again.
    pub fn take_parked(&self) -> Vec<String> {
        self.lock_parked().drain(..).collect()
    }

    fn lock_tickets(&self) -> MutexGuard<'_, VecDeque<String>> {
        self.tickets.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn lock_parked(&self) -> MutexGuard<'_, Vec<String>> {
        self.parked.lock().unwrap_or_else(|e| e.into_inner())
    }
}

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
        /// True when the answer came from auto-approve being switched on
        /// rather than from the user picking this option. The transcript
        /// reports the two differently.
        auto: bool,
    },
    Cancelled,
}

/// How a parked request ended, from the waiting caller's point of view.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParkOutcome {
    Selected {
        option_id: String,
        kind: PermissionOptionKind,
        auto: bool,
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

    pub fn evaluate(&self, policy: &SessionPolicy, spec: &PermissionRequestSpec) -> Evaluation {
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

        preset_decision(policy, spec)
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
            Ok(Ok(ParkedDecision::Selected {
                option_id,
                kind,
                auto,
            })) if !option_id.is_empty() => ParkOutcome::Selected {
                option_id,
                kind,
                auto,
            },
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
                auto: false,
            })
            .is_ok();

        if delivered {
            self.record_choice(&pending.spec, option_kind);
        }
        delivered
    }

    /// Answers a parked request with the mildest allow it was offered — this
    /// is auto-approve being switched on while the user left a prompt
    /// standing. No grant is recorded: the session-wide flip is the consent,
    /// and persisting it as a standing grant would outlive the session.
    ///
    /// Returns the spec so the caller can settle its own bookkeeping (an ACP
    /// session mints a ticket for a Carbide MCP call here).
    pub fn resolve_auto(&self, request_id: &str) -> Option<PermissionRequestSpec> {
        let pending = self.pending().remove(request_id)?;
        // No allow on offer is the same dead end `auto_answer` hits: there is
        // nothing to say yes with, so the call is cancelled rather than
        // silently left parked.
        let decision = match select_allow(&pending.spec.options) {
            Some(option) => ParkedDecision::Selected {
                option_id: option.option_id.clone(),
                kind: option.kind,
                auto: true,
            },
            None => ParkedDecision::Cancelled,
        };
        pending.responder.send(decision).ok()?;
        Some(pending.spec)
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

/// Auto-approve covers every kind, `Delete` and `Execute` included. Carving
/// those out would not be a safety floor — an approved `Execute` can delete
/// anything — and a switch labelled "auto-approve" that still interrupts is
/// the mislabelling this control exists to remove.
///
/// Below the flip, every kind is spelled out: a new one must fail to compile
/// rather than default to a permission.
fn preset_decision(policy: &SessionPolicy, spec: &PermissionRequestSpec) -> Evaluation {
    if policy.auto_approve() {
        return Evaluation::Allow;
    }
    match spec.kind {
        ToolKind::Read | ToolKind::Search | ToolKind::Think | ToolKind::Fetch => Evaluation::Allow,
        ToolKind::SwitchMode if !spec.mutating => Evaluation::Allow,
        ToolKind::Edit | ToolKind::Move | ToolKind::SwitchMode => Evaluation::Prompt,
        ToolKind::Delete | ToolKind::Execute | ToolKind::Other => Evaluation::Prompt,
    }
}

/// The option to answer an auto-allow with: the mildest grant on offer.
pub fn select_allow(options: &[PermissionOptionSpec]) -> Option<&PermissionOptionSpec> {
    [
        PermissionOptionKind::AllowOnce,
        PermissionOptionKind::AllowAlways,
    ]
    .iter()
    .find_map(|kind| options.iter().find(|option| option.kind == *kind))
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
