import type { AssistantSessionStore } from "$lib/features/assistant";
import type { RagService } from "$lib/features/rag/application/rag_service";
import type { RagStore } from "$lib/features/rag/state/rag_store.svelte";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// The single hydration per vault switch (C1 anchor): one index holds sessions
// of every kind, so one load fills the store. RagService owns the
// field-migration boundary for files written before a field existed.
export async function load_assistant_sessions(
  sessions: AssistantSessionStore,
  rag_store: RagStore,
  rag_service: RagService,
  vault_id: string,
  is_current: () => boolean = () => true,
  retention_days = 0,
): Promise<void> {
  const loaded = await rag_service.load_all_sessions(vault_id);
  if (!is_current()) return;
  sessions.hydrate(loaded);
  prune_stale_sessions(sessions, rag_service, vault_id, retention_days);
  rag_store.reset_view_state();
}

// Pruning rides the one hydration rather than a timer: it is the only moment
// the whole set is in hand, and running it before reset_view_state keeps a
// stale session from ever reaching the list. 0 days keeps everything.
function prune_stale_sessions(
  sessions: AssistantSessionStore,
  rag_service: RagService,
  vault_id: string,
  retention_days: number,
): void {
  if (retention_days <= 0) return;
  for (const id of sessions.prune(retention_days * MS_PER_DAY)) {
    void rag_service.delete_session(vault_id, id);
  }
}
