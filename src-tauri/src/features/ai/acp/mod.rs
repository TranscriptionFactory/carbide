pub mod agent_def;
pub mod policy;
pub mod session;
pub mod translate;

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub use agent_def::{pick_session_mode, resolve_acp_launch, AcpAgentSpec, AcpLaunch, AcpPresetId};
pub use policy::{auto_decide, AutoDecision};
pub use session::{
    spawn_acp_session, AcpMcpServer, AcpSessionConfig, EventSink, SessionCommand, SessionHandle,
};
pub use translate::TurnTranslator;

/// Sessions idle for longer than this are torn down by [`AcpSessionManager::reap_idle`]'s
/// usual caller; the duration is passed in so tests can drive it directly.
pub const DEFAULT_MAX_IDLE: Duration = Duration::from_secs(600);

struct ManagedSession {
    handle: SessionHandle,
    agent_fingerprint: String,
    vault_path: String,
    last_used: Instant,
}

/// Live ACP agent processes, one per Carbide chat session.
#[derive(Default)]
pub struct AcpSessionManager {
    sessions: Mutex<HashMap<String, ManagedSession>>,
}

impl AcpSessionManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Reuses the running agent for this chat only when it is the same agent
    /// against the same vault; anything else is a different conversation as far
    /// as the agent is concerned, so the old process is retired first.
    pub fn get_or_spawn(
        &self,
        chat_session_id: &str,
        agent_fingerprint: &str,
        config: AcpSessionConfig,
    ) -> Result<SessionHandle, String> {
        let mut sessions = self.sessions.lock().unwrap();

        if let Some(existing) = sessions.get_mut(chat_session_id) {
            if existing.agent_fingerprint == agent_fingerprint
                && existing.vault_path == config.cwd
                && existing.handle.is_alive()
            {
                existing.last_used = Instant::now();
                return Ok(existing.handle.clone());
            }
            if let Some(stale) = sessions.remove(chat_session_id) {
                stale.handle.shutdown();
            }
        }

        let vault_path = config.cwd.clone();
        let handle = spawn_acp_session(config)?;
        sessions.insert(
            chat_session_id.to_string(),
            ManagedSession {
                handle: handle.clone(),
                agent_fingerprint: agent_fingerprint.to_string(),
                vault_path,
                last_used: Instant::now(),
            },
        );
        Ok(handle)
    }

    pub fn get(&self, chat_session_id: &str) -> Option<SessionHandle> {
        self.sessions
            .lock()
            .unwrap()
            .get(chat_session_id)
            .map(|session| session.handle.clone())
    }

    pub fn remove(&self, chat_session_id: &str) {
        if let Some(session) = self.sessions.lock().unwrap().remove(chat_session_id) {
            session.handle.shutdown();
        }
    }

    pub fn shutdown_all(&self) {
        for (_, session) in self.sessions.lock().unwrap().drain() {
            session.handle.shutdown();
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
                session.handle.shutdown();
            }
        }
        expired.len()
    }
}
