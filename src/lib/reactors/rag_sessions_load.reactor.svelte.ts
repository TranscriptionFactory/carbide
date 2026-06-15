import type { VaultStore } from "$lib/features/vault";
import type { RagService, RagStore } from "$lib/features/rag";
import type { RagSession } from "$lib/features/rag";

export async function load_rag_sessions(
  rag_store: RagStore,
  rag_service: RagService,
  vault_id: string,
  is_current: () => boolean = () => true,
): Promise<void> {
  const summaries = await rag_service.list_sessions(vault_id);
  const sessions = (
    await Promise.all(
      summaries.map((summary) =>
        rag_service.load_session(vault_id, summary.id),
      ),
    )
  ).filter((session): session is RagSession => session !== null);
  if (!is_current()) return;
  rag_store.hydrate(sessions);
}

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
