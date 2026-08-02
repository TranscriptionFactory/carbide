import type { VaultStore } from "$lib/features/vault";
import type {
  AssistantChatStore,
  AssistantSessionService,
  AssistantSessionStore,
} from "$lib/features/assistant";
import { load_assistant_sessions } from "$lib/features/assistant";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";

export function create_assistant_sessions_load_reactor(
  sessions: AssistantSessionStore,
  chat_store: AssistantChatStore,
  session_service: AssistantSessionService,
  vault_store: VaultStore,
  ui_store: UIStore,
): () => void {
  let loaded_vault_id: string | null = null;

  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.active_vault_id;
      if (vault_id === loaded_vault_id) return;
      loaded_vault_id = vault_id;
      if (!vault_id) {
        sessions.hydrate([]);
        chat_store.reset_view_state();
        return;
      }
      void load_assistant_sessions(
        sessions,
        chat_store,
        session_service,
        vault_id,
        () => vault_store.active_vault_id === vault_id,
        ui_store.editor_settings.assistant_session_retention_days,
      );
    });
  });
}
