import type { AssistantSessionStore } from "$lib/features/assistant";
import type { RagService } from "$lib/features/rag/application/rag_service";
import type { RagStore } from "$lib/features/rag/state/rag_store.svelte";

// The single hydration per vault switch (C1 anchor): one index holds sessions
// of every kind, so one load fills the store. RagService owns the
// field-migration boundary for files written before a field existed.
export async function load_assistant_sessions(
  sessions: AssistantSessionStore,
  rag_store: RagStore,
  rag_service: RagService,
  vault_id: string,
  is_current: () => boolean = () => true,
): Promise<void> {
  const loaded = await rag_service.load_all_sessions(vault_id);
  if (!is_current()) return;
  sessions.hydrate(loaded);
  rag_store.reset_view_state();
}
