import type { RagPersistencePort } from "$lib/features/rag/ports";
import type {
  RagSession,
  RagSessionSummary,
} from "$lib/features/rag/domain/rag_types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function to_summary(session: RagSession): RagSessionSummary {
  return {
    id: session.id,
    title: session.title,
    created_at: session.created_at,
    updated_at: session.updated_at,
  };
}

export function create_test_rag_persistence_adapter(): RagPersistencePort {
  const vaults = new Map<string, Map<string, RagSession>>();

  function bucket(vault_id: string): Map<string, RagSession> {
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
