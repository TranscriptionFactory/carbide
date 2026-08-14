pub mod agent_def;
pub mod policy;
pub mod session;
pub mod translate;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::features::ai::permissions::SessionPolicy;

pub use agent_def::{resolve_acp_launch, AcpAgentSpec, AcpPresetId};
pub use session::{AcpSessionConfig, EventSink, SessionHandle};
pub use translate::TurnTranslator;

use session::spawn_acp_session;

/// Sessions idle for longer than this are torn down by [`AcpSessionManager::reap_idle`]'s
/// usual caller; the duration is passed in so tests can drive it directly.
pub const DEFAULT_MAX_IDLE: Duration = Duration::from_secs(600);

/// Runs when a session is retired on any path — this is where the scoped MCP
/// token minted for the process gets revoked, so token lifetime is owned by
/// the same thing that owns process lifetime.
type RetireHook = Box<dyn FnOnce() + Send>;

struct ManagedSession {
    handle: SessionHandle,
    agent_fingerprint: String,
    vault_path: String,
    /// The live consent cell the running process reads. Held here so its
    /// lifetime IS the session's — retiring the session drops it, and no
    /// separate table can fall out of step with which policy is live.
    policy: Arc<SessionPolicy>,
    last_used: Instant,
    on_retire: Option<RetireHook>,
}

fn retire(mut session: ManagedSession) {
    session.handle.shutdown();
    if let Some(hook) = session.on_retire.take() {
        hook();
    }
}

/// Live ACP agent processes, one per Carbide chat session.
#[derive(Default)]
pub struct AcpSessionManager {
    sessions: Mutex<HashMap<String, ManagedSession>>,
}

impl AcpSessionManager {
    /// The cheap path for follow-up turns: returns the live handle only when
    /// it is the same agent under the same grant against the same vault, so
    /// callers can skip launch resolution, token minting and catalog work
    /// entirely. The fingerprint covers the surface's tool scope, which the
    /// scoped token is minted against; consent is not in it, because it lives
    /// in the cell returned alongside the handle — which is exactly what lets
    /// it be flipped without retiring the process.
    pub fn get_matching(
        &self,
        chat_session_id: &str,
        agent_fingerprint: &str,
        vault_path: &str,
    ) -> Option<(SessionHandle, Arc<SessionPolicy>)> {
        let mut sessions = self.sessions.lock().unwrap();
        let existing = sessions.get_mut(chat_session_id)?;
        if existing.agent_fingerprint == agent_fingerprint
            && existing.vault_path == vault_path
            && existing.handle.is_alive()
        {
            existing.last_used = Instant::now();
            return Some((existing.handle.clone(), existing.policy.clone()));
        }
        None
    }

    /// The cell a mid-conversation flip is addressed to.
    pub fn policy(&self, chat_session_id: &str) -> Option<Arc<SessionPolicy>> {
        Some(self.sessions.lock().unwrap().get(chat_session_id)?.policy.clone())
    }

    /// Reuses the running agent for this chat only when it is the same agent
    /// against the same vault under the same grant; anything else is a
    /// different conversation as far as the agent is concerned, so the old
    /// process is retired first.
    /// Returns the policy alongside the handle so the caller always ends up
    /// holding the cell the *returned* session actually reads — on the reuse
    /// branch that is the existing session's, not the one just built for a
    /// spawn that did not happen.
    pub fn get_or_spawn(
        &self,
        chat_session_id: &str,
        agent_fingerprint: &str,
        config: AcpSessionConfig,
        on_retire: RetireHook,
    ) -> Result<(SessionHandle, Arc<SessionPolicy>), String> {
        let mut sessions = self.sessions.lock().unwrap();

        if let Some(existing) = sessions.get_mut(chat_session_id) {
            if existing.agent_fingerprint == agent_fingerprint
                && existing.vault_path == config.cwd
                && existing.handle.is_alive()
            {
                existing.last_used = Instant::now();
                on_retire();
                return Ok((existing.handle.clone(), existing.policy.clone()));
            }
            if let Some(stale) = sessions.remove(chat_session_id) {
                retire(stale);
            }
        }

        let vault_path = config.cwd.clone();
        let policy = config.policy.clone();
        let handle = spawn_acp_session(config)?;
        sessions.insert(
            chat_session_id.to_string(),
            ManagedSession {
                handle: handle.clone(),
                agent_fingerprint: agent_fingerprint.to_string(),
                vault_path,
                policy: policy.clone(),
                last_used: Instant::now(),
                on_retire: Some(on_retire),
            },
        );
        Ok((handle, policy))
    }

    pub fn remove(&self, chat_session_id: &str) {
        if let Some(session) = self.sessions.lock().unwrap().remove(chat_session_id) {
            retire(session);
        }
    }

    pub fn shutdown_all(&self) {
        for (_, session) in self.sessions.lock().unwrap().drain() {
            retire(session);
        }
    }

    /// Returns how many sessions were retired.
    pub fn reap_idle(&self, max_idle: Duration) -> usize {
        let mut sessions = self.sessions.lock().unwrap();
        let expired: Vec<String> = sessions
            .iter()
            .filter(|(_, session)| {
                session.last_used.elapsed() > max_idle || !session.handle.is_alive()
            })
            .map(|(id, _)| id.clone())
            .collect();

        for id in &expired {
            if let Some(session) = sessions.remove(id) {
                retire(session);
            }
        }
        expired.len()
    }
}
