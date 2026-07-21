import type { VaultStore } from "$lib/features/vault";
import type { AiStore, AiHistoryPersistencePort } from "$lib/features/ai";

export function create_ai_history_load_reactor(
  ai_store: AiStore,
  ai_history: AiHistoryPersistencePort,
  vault_store: VaultStore,
): () => void {
  let loaded_vault_id: string | null = null;

  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.active_vault_id;
      if (vault_id === loaded_vault_id) return;
      loaded_vault_id = vault_id;
      if (!vault_id) {
        ai_store.hydrate_turns([]);
        return;
      }
      void ai_history.load_history(vault_id).then((turns) => {
        if (vault_store.active_vault_id !== vault_id) return;
        ai_store.hydrate_turns(turns);
      });
    });
  });
}
