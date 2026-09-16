import type { TabStore } from "$lib/features/tab";
import type {
  AssistantSessionService,
  AssistantSessionStore,
} from "$lib/features/assistant";
import { ensure_assistant_session_loaded } from "$lib/features/assistant";

// Sessions hydrate as summary stubs. A session tab restored from the saved
// layout never passes through assistant_open_session, so this loads its body
// once it is actually shown; tabs opened by the action are already loaded and
// cost nothing.
export function create_assistant_session_tab_bodies_reactor(
  tab_store: TabStore,
  sessions: AssistantSessionStore,
  session_service: AssistantSessionService,
): () => void {
  const in_flight = new Set<string>();

  return $effect.root(() => {
    $effect(() => {
      for (const tab of [tab_store.active_tab, tab_store.secondary_tab]) {
        if (tab?.kind !== "assistant_session") continue;
        const id = tab.session_id;
        if (in_flight.has(id)) continue;
        in_flight.add(id);
        void ensure_assistant_session_loaded(
          sessions,
          session_service,
          id,
        ).finally(() => in_flight.delete(id));
      }
    });
  });
}
