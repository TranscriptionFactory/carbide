import type { TabStore } from "$lib/features/tab";
import type {
  AssistantSessionService,
  AssistantSessionStore,
} from "$lib/features/assistant";
import { ensure_assistant_session_loaded } from "$lib/features/assistant";

// Sessions hydrate as summary stubs. A session tab restored from the saved
// layout never passes through assistant_open_session, so this is what loads
// its body; tabs opened by the action are already loaded and cost nothing.
export function create_assistant_session_tab_bodies_reactor(
  tab_store: TabStore,
  sessions: AssistantSessionStore,
  session_service: AssistantSessionService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const vault_id = sessions.vault_id;
      if (!vault_id) return;
      for (const tab of tab_store.tabs) {
        if (tab.kind !== "assistant_session") continue;
        if (
          !sessions.get(tab.session_id) ||
          sessions.is_loaded(tab.session_id)
        ) {
          continue;
        }
        void ensure_assistant_session_loaded(
          sessions,
          session_service,
          vault_id,
          tab.session_id,
        );
      }
    });
  });
}
