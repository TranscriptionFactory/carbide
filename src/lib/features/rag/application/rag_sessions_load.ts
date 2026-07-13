import type { RagService } from "$lib/features/rag/application/rag_service";
import type { RagStore } from "$lib/features/rag/state/rag_store.svelte";

export async function load_rag_sessions(
  rag_store: RagStore,
  rag_service: RagService,
  vault_id: string,
  is_current: () => boolean = () => true,
): Promise<void> {
  const sessions = await rag_service.load_all_sessions(vault_id);
  if (!is_current()) return;
  rag_store.hydrate(sessions);
}
