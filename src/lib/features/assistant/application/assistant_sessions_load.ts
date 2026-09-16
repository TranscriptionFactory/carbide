import type { AssistantSessionStore } from "$lib/features/assistant/state/assistant_session_store.svelte";
import type { AssistantChatStore } from "$lib/features/assistant/state/assistant_chat_store.svelte";
import type { AssistantSessionService } from "$lib/features/assistant/application/assistant_session_service";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// The single hydration per vault switch (C1 anchor): one index holds sessions
// of every kind, so one list fills the store. Bodies are read on demand by
// ensure_assistant_session_loaded; hydrating them all here cost one file read
// per session on every launch.
export async function load_assistant_sessions(
  sessions: AssistantSessionStore,
  chat_store: AssistantChatStore,
  session_service: AssistantSessionService,
  vault_id: string,
  is_current: () => boolean = () => true,
  retention_days = 0,
): Promise<void> {
  const summaries = await session_service.list_sessions(vault_id);
  if (!is_current()) return;
  sessions.hydrate_summaries(summaries, vault_id);
  prune_stale_sessions(sessions, session_service, vault_id, retention_days);
  chat_store.reset_view_state();
}

// Loads a session's body into the store if it is listed but still a stub.
// Every path that reads or saves a body (switching to it, renaming it,
// showing a restored tab) awaits this first.
export async function ensure_assistant_session_loaded(
  sessions: AssistantSessionStore,
  session_service: AssistantSessionService,
  id: string,
): Promise<void> {
  const vault_id = sessions.vault_id;
  if (!vault_id || sessions.is_loaded(id) || !sessions.get(id)) return;
  const loaded = await session_service.load_session(vault_id, id);
  if (!loaded || sessions.vault_id !== vault_id) return;
  sessions.attach_body(loaded);
}

// Pruning rides the one hydration rather than a timer: it is the only moment
// the whole set is in hand, and running it before reset_view_state keeps a
// stale session from ever reaching the list. 0 days keeps everything.
function prune_stale_sessions(
  sessions: AssistantSessionStore,
  session_service: AssistantSessionService,
  vault_id: string,
  retention_days: number,
): void {
  if (retention_days <= 0) return;
  for (const id of sessions.prune(retention_days * MS_PER_DAY)) {
    void session_service.delete_session(vault_id, id);
  }
}
