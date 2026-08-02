import type {
  AssistantSession,
  AssistantSessionPersistencePort,
  AssistantSessionSummary,
} from "$lib/features/assistant";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function to_summary(session: AssistantSession): AssistantSessionSummary {
  return {
    id: session.id,
    kind: session.kind,
    title: session.title,
    created_at: session.created_at,
    updated_at: session.updated_at,
  };
}

export function create_test_assistant_session_persistence_adapter(): AssistantSessionPersistencePort {
  const vaults = new Map<string, Map<string, AssistantSession>>();

  function bucket(vault_id: string): Map<string, AssistantSession> {
    let sessions = vaults.get(vault_id);
    if (!sessions) {
      sessions = new Map();
      vaults.set(vault_id, sessions);
    }
    return sessions;
  }

  return {
    list_sessions(vault_id) {
      const summaries = [...bucket(vault_id).values()]
        .map(to_summary)
        .sort((a, b) => b.updated_at - a.updated_at);
      return Promise.resolve(summaries);
    },

    load_session(vault_id, id) {
      const session = bucket(vault_id).get(id);
      return Promise.resolve(session ? clone(session) : null);
    },

    save_session(vault_id, session) {
      bucket(vault_id).set(session.id, clone(session));
      return Promise.resolve();
    },

    delete_session(vault_id, id) {
      bucket(vault_id).delete(id);
      return Promise.resolve();
    },
  };
}
