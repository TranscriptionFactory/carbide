import { load_assistant_sessions } from "$lib/features/rag";
import type { VaultStore } from "$lib/features/vault";
import type { AssistantSessionStore } from "$lib/features/assistant";
import type { RagService, RagStore } from "$lib/features/rag";

export function create_assistant_sessions_load_reactor(
  sessions: AssistantSessionStore,
  rag_store: RagStore,
  rag_service: RagService,
  vault_store: VaultStore,
): () => void {
  let loaded_vault_id: string | null = null;

  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.active_vault_id;
      if (vault_id === loaded_vault_id) return;
      loaded_vault_id = vault_id;
      if (!vault_id) {
        sessions.hydrate([]);
        rag_store.reset_view_state();
        return;
      }
      void load_assistant_sessions(
        sessions,
        rag_store,
        rag_service,
        vault_id,
        () => vault_store.active_vault_id === vault_id,
      );
    });
  });
}
