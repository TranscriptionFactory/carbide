import type { VaultStore } from "$lib/features/vault";
import type { RagService, RagStore } from "$lib/features/rag";
import { load_rag_sessions } from "$lib/features/rag";

export function create_rag_sessions_load_reactor(
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
        rag_store.hydrate([]);
        return;
      }
      void load_rag_sessions(
        rag_store,
        rag_service,
        vault_id,
        () => vault_store.active_vault_id === vault_id,
      );
    });
  });
}
